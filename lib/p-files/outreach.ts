import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

const REMINDER_COOLDOWN_HOURS = 24;

type RawOutreachRow = {
  enrolee_number: string;
  slot_key: string;
  promised_until: string | null;
  note: string | null;
  created_at: string;
};

// Promised-cohort variant: keeps the LATEST kind='promise' row per
// (enrolee, slot) regardless of whether promised_until is in the past.
// `getLatestPromisesForRoster` keeps past-due promises so the chase queue
// can flag missed dates.
export type LatestPromise = {
  promisedUntil: string;
  note: string | null;
};

export async function getLatestPromisesForRoster(
  ayCode: string,
  enroleeNumbers: string[],
  client?: SupabaseClient,
): Promise<Map<string, Map<string, LatestPromise>>> {
  if (enroleeNumbers.length === 0) return new Map();

  const service = client ?? createServiceClient();
  const { data, error } = await service
    .from("p_file_outreach")
    .select("enrolee_number, slot_key, promised_until, note, created_at")
    .eq("ay_code", ayCode)
    .eq("kind", "promise")
    .in("enrolee_number", enroleeNumbers)
    .order("created_at", { ascending: false });

  if (error || !data) return new Map();

  const byStudent = new Map<string, Map<string, LatestPromise>>();
  for (const row of data as Array<
    Pick<RawOutreachRow, "enrolee_number" | "slot_key" | "promised_until" | "note">
  >) {
    if (row.promised_until === null) continue;
    let bySlot = byStudent.get(row.enrolee_number);
    if (!bySlot) {
      bySlot = new Map();
      byStudent.set(row.enrolee_number, bySlot);
    }
    if (bySlot.has(row.slot_key)) continue; // first row wins (latest by created_at desc)
    bySlot.set(row.slot_key, {
      promisedUntil: row.promised_until,
      note: row.note,
    });
  }
  return byStudent;
}

// Server-side cooldown check used by the notify routes. Returns the most
// recent reminder timestamp if one is within the cooldown window, else
// null. Caller 429s when this returns non-null.
export async function getActiveCooldown(
  ayCode: string,
  enroleeNumber: string,
  slotKey: string,
  client?: SupabaseClient,
): Promise<{ lastSentAt: string; hoursAgo: number } | null> {
  const service = client ?? createServiceClient();
  const { data, error } = await service
    .from("p_file_outreach")
    .select("created_at")
    .eq("ay_code", ayCode)
    .eq("enrolee_number", enroleeNumber)
    .eq("slot_key", slotKey)
    .eq("kind", "reminder")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const lastSentAt = (data as { created_at: string }).created_at;
  const hoursAgo = (Date.now() - new Date(lastSentAt).getTime()) / 36e5;
  if (hoursAgo >= REMINDER_COOLDOWN_HOURS) return null;
  return { lastSentAt, hoursAgo };
}
