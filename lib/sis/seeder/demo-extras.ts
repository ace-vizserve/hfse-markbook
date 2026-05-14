import type { SupabaseClient } from '@supabase/supabase-js';

import { hashString, mulberry32, prefixFor } from './random';

// Demo-extras seeder. Layered on top of seedPopulated() to fill the
// dashboard charts + KPIs that the existing seeder leaves thin. Targeted
// at the 1-hour CEO/user demo where the focus is "do dashboards look like
// real production usage."
//
// Nine passes, all idempotent (skip-guarded by an existence count):
//   1. seedPublicationsExpanded   — 3 published report-card windows across T1+T2
//   2. seedParentAccounts         — 5 parent auth.users tied to enrolled emails
//   3. seedPFileLifecycle         — outreach rows + 60d/90d expiry buckets
//   4. seedEvaluationLifecycle    — T1 closed / T2 open / T2 partial writeups + PTC
//   5. seedCalendarEnhancements   — typed events + audience overrides + tentative
//   6. seedEnrollmentStatusMix    — flips a few rows to late_enrollee + withdrawn
//                                   so PP6's caption + PP9's "withdrawn at the
//                                   bottom" + KD #68's late-enrollee term suffix
//                                   all have data to render against.
//   7. seedVacationLeaveEntries   — flips ~1 attendance entry per student in one
//                                   target section to EX:vacation in T1 so the
//                                   VacationLeaveQuotaCard has data (KD #94).
//   8. seedEvaluationTopics       — 6 checklist topics for one (section × subject
//                                   × term) so the topic manager + roster grid
//                                   have data to render (KD #92 / #93).
//   9. seedEvaluationRatings      — 1-5 rating per student per topic for the
//                                   topics seeded in pass 8 so the per-topic
//                                   1-5 RatingSelector demo lights up (KD #92).
//
// `seedChangeRequests` is intentionally NOT invoked from this orchestrator
// (the function still exists in this file for future re-enablement). The
// auto-generated CRs created field/reason combinations that didn't always
// align with the realistic teacher workflow we want to demo, so the demo
// flow now has the presenter file a fresh CR live, then approve it,
// rather than relying on pre-seeded rows.
//
// All passes use service-role + skip-guards so re-running on a partially
// seeded AY9999 is safe (no duplicate inserts, no failed unique-key
// errors).

export type DemoExtrasResult = {
  publications_extra: number;
  parent_accounts: number;
  pfile_outreach: number;
  pfile_expiry_updates: number;
  evaluation_terms: number;
  evaluation_writeups_t2: number;
  evaluation_ptc_feedback: number;
  calendar_events_extra: number;
  school_calendar_audience_overrides: number;
  late_enrollees_flipped: number;
  withdrawals_flipped: number;
  change_requests_inserted: number;
  vacation_leave_entries: number;
  evaluation_topics: number;
  evaluation_ratings: number;
};

export async function seedDemoExtras(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<DemoExtrasResult> {
  const result: DemoExtrasResult = {
    publications_extra: 0,
    parent_accounts: 0,
    pfile_outreach: 0,
    pfile_expiry_updates: 0,
    evaluation_terms: 0,
    evaluation_writeups_t2: 0,
    evaluation_ptc_feedback: 0,
    calendar_events_extra: 0,
    school_calendar_audience_overrides: 0,
    late_enrollees_flipped: 0,
    withdrawals_flipped: 0,
    change_requests_inserted: 0,
    vacation_leave_entries: 0,
    evaluation_topics: 0,
    evaluation_ratings: 0,
  };

  result.publications_extra = await seedPublicationsExpanded(service, testAy);
  result.parent_accounts = await seedParentAccounts(service, testAy);
  const pf = await seedPFileLifecycle(service, testAy);
  result.pfile_outreach = pf.outreach;
  result.pfile_expiry_updates = pf.expiryUpdates;
  const ev = await seedEvaluationLifecycle(service, testAy);
  result.evaluation_terms = ev.terms;
  result.evaluation_writeups_t2 = ev.writeupsT2;
  result.evaluation_ptc_feedback = ev.ptc;
  const cal = await seedCalendarEnhancements(service, testAy);
  result.calendar_events_extra = cal.events;
  result.school_calendar_audience_overrides = cal.audienceOverrides;
  const enr = await seedEnrollmentStatusMix(service, testAy);
  result.late_enrollees_flipped = enr.late;
  result.withdrawals_flipped = enr.withdrawn;
  // seedChangeRequests intentionally not invoked — see header comment.
  // The presenter files + approves a CR live during the demo instead.
  result.vacation_leave_entries = await seedVacationLeaveEntries(service, testAy);
  const evTopics = await seedEvaluationTopics(service, testAy);
  result.evaluation_topics = evTopics.topics;
  result.evaluation_ratings = await seedEvaluationRatings(service, testAy, evTopics);

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Expanded publications — 3 windows across T1 + T2, varied sections.
// ─────────────────────────────────────────────────────────────────────────

async function seedPublicationsExpanded(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  const { data: termRows } = await service
    .from('terms')
    .select('id, term_number')
    .eq('academic_year_id', testAy.id)
    .order('term_number');
  const terms = (termRows ?? []) as Array<{ id: string; term_number: number }>;
  const t1 = terms.find((t) => t.term_number === 1);
  const t2 = terms.find((t) => t.term_number === 2);
  if (!t1) return 0;

  const { data: sectionRows } = await service
    .from('sections')
    .select('id, name')
    .eq('academic_year_id', testAy.id)
    .order('name');
  const sections = (sectionRows ?? []) as Array<{ id: string; name: string }>;
  if (sections.length === 0) return 0;

  // Pick 3 varied sections (early / middle / late in the alphabetic order)
  // so we cover different levels.
  const pickIdx = (n: number, idx: number) => Math.floor((idx * n) / 3);
  const picks = [pickIdx(sections.length, 0), pickIdx(sections.length, 1), pickIdx(sections.length, 2)]
    .map((i) => sections[i])
    .filter(Boolean);

  // Three publications: section A T1, section B T1, section C T2 (if T2 exists).
  type Plan = { sectionId: string; termId: string };
  const plans: Plan[] = [
    { sectionId: picks[0].id, termId: t1.id },
    picks[1] && { sectionId: picks[1].id, termId: t1.id },
    picks[2] && t2 && { sectionId: picks[2].id, termId: t2.id },
  ].filter(Boolean) as Plan[];

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let inserted = 0;
  for (const plan of plans) {
    // Skip-guard per (section, term) — uniqueness constraint enforces it
    // anyway, but a pre-check keeps the count clean on re-runs.
    const { count: existing } = await service
      .from('report_card_publications')
      .select('id', { count: 'exact', head: true })
      .eq('section_id', plan.sectionId)
      .eq('term_id', plan.termId);
    if ((existing ?? 0) > 0) continue;

    const from = new Date(now - 7 * day);
    const until = new Date(now + 21 * day);
    const { error } = await service.from('report_card_publications').insert({
      section_id: plan.sectionId,
      term_id: plan.termId,
      publish_from: from.toISOString(),
      publish_until: until.toISOString(),
      published_by: 'demo-seeder@hfse.edu.sg',
      notified_at: new Date(now - 6 * day).toISOString(),
    });
    if (error) {
      console.error('[demo-extras] publications insert failed:', error.message);
      continue;
    }
    inserted += 1;
  }
  return inserted;
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Parent accounts — auth.users entries tied to seeded enrolled emails.
// ─────────────────────────────────────────────────────────────────────────

async function seedParentAccounts(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  const prefix = prefixFor(testAy.ay_code);
  const appsTable = `${prefix}_enrolment_applications`;
  const statusTable = `${prefix}_enrolment_status`;

  // Pick 5 enrolled rows with distinct mother emails (used as the parent
  // login). One enrolled row's motherEmail = one parent account.
  const { data: appsData } = await service
    .from(appsTable)
    .select('enroleeNumber, motherEmail, fatherEmail')
    .not('motherEmail', 'is', null)
    .neq('motherEmail', '')
    .limit(50);
  const apps = (appsData ?? []) as Array<{
    enroleeNumber: string;
    motherEmail: string | null;
    fatherEmail: string | null;
  }>;
  if (apps.length === 0) return 0;

  const { data: statusData } = await service
    .from(statusTable)
    .select('enroleeNumber, applicationStatus');
  const enrolledSet = new Set(
    ((statusData ?? []) as Array<{ enroleeNumber: string; applicationStatus: string | null }>)
      .filter((s) => s.applicationStatus === 'Enrolled' || s.applicationStatus === 'Enrolled (Conditional)')
      .map((s) => s.enroleeNumber),
  );

  const enrolledApps = apps.filter((a) => enrolledSet.has(a.enroleeNumber));
  const seen = new Set<string>();
  const targets: Array<{ email: string; enroleeNumber: string }> = [];
  for (const a of enrolledApps) {
    const email = (a.motherEmail ?? '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    targets.push({ email, enroleeNumber: a.enroleeNumber });
    if (targets.length >= 5) break;
  }
  if (targets.length === 0) return 0;

  // Pre-fetch existing users so we don't try to recreate.
  const { data: existingUsers } = await service.auth.admin.listUsers({ perPage: 1000 });
  const existingByEmail = new Map<string, string>();
  for (const u of existingUsers?.users ?? []) {
    if (u.email) existingByEmail.set(u.email.toLowerCase(), u.id);
  }

  let created = 0;
  for (const t of targets) {
    if (existingByEmail.has(t.email)) continue;
    const { error } = await service.auth.admin.createUser({
      email: t.email,
      password: 'demo-2026!Parent',
      email_confirm: true,
      app_metadata: {}, // null role = parent (KD #11)
      user_metadata: { seeded_for_enrolee: t.enroleeNumber },
    });
    if (error) {
      console.error(`[demo-extras] parent account create failed for ${t.email}:`, error.message);
      continue;
    }
    created += 1;
  }
  return created;
}

// ─────────────────────────────────────────────────────────────────────────
// 3. P-Files lifecycle — outreach rows + 60d/90d expiry buckets.
// ─────────────────────────────────────────────────────────────────────────

async function seedPFileLifecycle(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<{ outreach: number; expiryUpdates: number }> {
  const prefix = prefixFor(testAy.ay_code);
  const docsTable = `${prefix}_enrolment_documents`;
  const statusTable = `${prefix}_enrolment_status`;

  // Skip-guard: outreach rows already present for this AY.
  const { count: existingOutreach } = await service
    .from('p_file_outreach')
    .select('id', { count: 'exact', head: true })
    .eq('ay_code', testAy.ay_code);

  // Find enrolled rows we can attach demo data to.
  const { data: statusData } = await service
    .from(statusTable)
    .select('enroleeNumber, applicationStatus');
  const enrolled = ((statusData ?? []) as Array<{
    enroleeNumber: string;
    applicationStatus: string | null;
  }>)
    .filter((s) => s.applicationStatus === 'Enrolled' || s.applicationStatus === 'Enrolled (Conditional)')
    .map((s) => s.enroleeNumber);

  const rand = mulberry32(hashString(`${testAy.ay_code}:pfile-extras`));

  // ---- 3a. Widen expiry buckets: 60-day and 90-day windows ----
  // The base seeder populates 30-day + already-expired. We add 60-day and
  // 90-day windows on a different slice of enrolled rows so the dashboard
  // donut shows depth across all three buckets.
  let expiryUpdates = 0;
  // Expand per-slot expiry across the enrolled population. Slices are
  // chosen so they don't overlap with the base seeder's ranges (0..18).
  const SIXTY_DAY_PASSPORT = enrolled.slice(20, 27); // 7 rows
  const NINETY_DAY_PASSPORT = enrolled.slice(27, 35); // 8 rows
  const SIXTY_DAY_PASS = enrolled.slice(35, 41); // 6 rows
  const NINETY_DAY_PASS = enrolled.slice(41, 48); // 7 rows
  // Mother passport / pass — adds depth to the parent-doc renewal scenario.
  const MOTHER_PASSPORT_60 = enrolled.slice(48, 53);
  const MOTHER_PASSPORT_90 = enrolled.slice(53, 58);

  const isoDate = (offsetDays: number): string =>
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  const bumps: Array<{ enroleeNumber: string; patch: Record<string, unknown> }> = [];
  for (const e of SIXTY_DAY_PASSPORT) {
    bumps.push({ enroleeNumber: e, patch: { passportExpiry: isoDate(31 + Math.floor(rand() * 30)) } });
  }
  for (const e of NINETY_DAY_PASSPORT) {
    bumps.push({ enroleeNumber: e, patch: { passportExpiry: isoDate(61 + Math.floor(rand() * 30)) } });
  }
  for (const e of SIXTY_DAY_PASS) {
    bumps.push({ enroleeNumber: e, patch: { passExpiry: isoDate(31 + Math.floor(rand() * 30)) } });
  }
  for (const e of NINETY_DAY_PASS) {
    bumps.push({ enroleeNumber: e, patch: { passExpiry: isoDate(61 + Math.floor(rand() * 30)) } });
  }
  for (const e of MOTHER_PASSPORT_60) {
    bumps.push({
      enroleeNumber: e,
      patch: { motherPassportExpiry: isoDate(31 + Math.floor(rand() * 30)) },
    });
  }
  for (const e of MOTHER_PASSPORT_90) {
    bumps.push({
      enroleeNumber: e,
      patch: { motherPassportExpiry: isoDate(61 + Math.floor(rand() * 30)) },
    });
  }

  for (const b of bumps) {
    const { error } = await service
      .from(docsTable)
      .update(b.patch)
      .eq('enroleeNumber', b.enroleeNumber);
    if (error) {
      console.warn(
        `[demo-extras] expiry update failed for ${b.enroleeNumber}:`,
        error.message,
      );
      continue;
    }
    expiryUpdates += 1;
  }

  // ---- 3b. p_file_outreach — reminder + promise rows ----
  let outreachInserted = 0;
  if ((existingOutreach ?? 0) === 0 && enrolled.length > 0) {
    const dayMs = 24 * 60 * 60 * 1000;
    const recipientFor = (e: string) => `mother+${e}@dev.hfse.test`;

    const outreachRows: Array<Record<string, unknown>> = [];

    // 5 reminder rows — registrar nudged the parent in the past 14 days.
    const reminderTargets = enrolled.slice(0, 5);
    const reminderSlots = ['passport', 'motherPassport', 'pass', 'fatherPass', 'passport'];
    for (let i = 0; i < reminderTargets.length; i++) {
      const e = reminderTargets[i];
      outreachRows.push({
        ay_code: testAy.ay_code,
        enrolee_number: e,
        slot_key: reminderSlots[i % reminderSlots.length],
        kind: 'reminder',
        channel: 'email',
        recipient_email: recipientFor(e),
        note: 'Auto-generated demo reminder.',
        created_at: new Date(Date.now() - (1 + i * 2) * dayMs).toISOString(),
        created_by_email: 'demo-seeder@hfse.edu.sg',
      });
    }

    // 3 promise rows — parent committed to upload by a future date.
    const promiseTargets = enrolled.slice(5, 8);
    for (let i = 0; i < promiseTargets.length; i++) {
      const e = promiseTargets[i];
      const promisedFor = new Date(Date.now() + (3 + i * 4) * dayMs)
        .toISOString()
        .slice(0, 10);
      outreachRows.push({
        ay_code: testAy.ay_code,
        enrolee_number: e,
        slot_key: i === 0 ? 'passport' : i === 1 ? 'motherPass' : 'medical',
        kind: 'promise',
        promised_until: promisedFor,
        note: `Parent confirmed upload by ${promisedFor}.`,
        created_at: new Date(Date.now() - (1 + i) * dayMs).toISOString(),
        created_by_email: 'demo-seeder@hfse.edu.sg',
      });
    }

    if (outreachRows.length > 0) {
      const { error } = await service.from('p_file_outreach').insert(outreachRows);
      if (error) {
        console.error('[demo-extras] p_file_outreach insert failed:', error.message);
      } else {
        outreachInserted = outreachRows.length;
      }
    }
  }

  return { outreach: outreachInserted, expiryUpdates };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Evaluation lifecycle — T1 closed / T2 open + partial / T3 unopened + PTC.
// ─────────────────────────────────────────────────────────────────────────

async function seedEvaluationLifecycle(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<{ terms: number; writeupsT2: number; ptc: number }> {
  const { data: termRows } = await service
    .from('terms')
    .select('id, term_number')
    .eq('academic_year_id', testAy.id)
    .order('term_number');
  const terms = (termRows ?? []) as Array<{ id: string; term_number: number }>;
  const t1 = terms.find((t) => t.term_number === 1);
  const t2 = terms.find((t) => t.term_number === 2);
  if (!t1) return { terms: 0, writeupsT2: 0, ptc: 0 };

  // ---- 4a. evaluation_terms rows ----
  // T1 = was opened then closed. T2 = currently open. T3 = no row (unopened).
  let termsInserted = 0;
  const dayMs = 24 * 60 * 60 * 1000;

  const { count: existingTerms } = await service
    .from('evaluation_terms')
    .select('id', { count: 'exact', head: true })
    .in('term_id', terms.map((t) => t.id));

  if ((existingTerms ?? 0) === 0) {
    const evalTermRows: Array<Record<string, unknown>> = [
      {
        term_id: t1.id,
        is_open: false,
        opened_at: new Date(Date.now() - 90 * dayMs).toISOString(),
      },
    ];
    if (t2) {
      evalTermRows.push({
        term_id: t2.id,
        is_open: true,
        opened_at: new Date(Date.now() - 14 * dayMs).toISOString(),
      });
    }
    const { error } = await service.from('evaluation_terms').insert(evalTermRows);
    if (error) {
      console.error('[demo-extras] evaluation_terms insert failed:', error.message);
    } else {
      termsInserted = evalTermRows.length;
    }
  }

  // ---- 4b. T2 partial writeups — ~30% of students per section ----
  let writeupsT2 = 0;
  if (t2) {
    const { count: existingT2Writeups } = await service
      .from('evaluation_writeups')
      .select('id', { count: 'exact', head: true })
      .eq('term_id', t2.id);

    if ((existingT2Writeups ?? 0) === 0) {
      const { data: sections } = await service
        .from('sections')
        .select('id')
        .eq('academic_year_id', testAy.id);
      const sectionIds = ((sections ?? []) as Array<{ id: string }>).map((r) => r.id);

      const T2_TEMPLATES = [
        'Continues to grow in confidence this term. Hope as a virtue is showing through their willingness to keep trying when problems get hard.',
        'Strong start to T2. Encouraging others in the class and showing genuine teamwork during group activities.',
        'Has settled in well after the break. Reading independently and asking thoughtful questions during lessons.',
      ];
      const rand = mulberry32(hashString(`${testAy.ay_code}:eval-t2`));
      const writeupRows: Array<Record<string, unknown>> = [];

      for (const sectionId of sectionIds) {
        const { data: enrolments } = await service
          .from('section_students')
          .select('student_id')
          .eq('section_id', sectionId)
          .limit(10);
        const students = ((enrolments ?? []) as Array<{ student_id: string }>);
        // ~30% of the section gets a partial writeup.
        const targetCount = Math.max(1, Math.floor(students.length * 0.3));
        for (let i = 0; i < targetCount; i++) {
          const tmpl = T2_TEMPLATES[Math.floor(rand() * T2_TEMPLATES.length)];
          writeupRows.push({
            term_id: t2.id,
            student_id: students[i].student_id,
            section_id: sectionId,
            writeup: tmpl,
            // Mostly unsubmitted (in-progress) — only ~half are submitted.
            submitted: rand() < 0.5,
            submitted_at: rand() < 0.5 ? new Date().toISOString() : null,
          });
        }
      }

      if (writeupRows.length > 0) {
        const { error } = await service.from('evaluation_writeups').insert(writeupRows);
        if (error) {
          console.error('[demo-extras] T2 writeups insert failed:', error.message);
        } else {
          writeupsT2 = writeupRows.length;
        }
      }
    }
  }

  // ---- 4c. PTC feedback — 30-50 rows for T1 ----
  let ptcInserted = 0;
  const { count: existingPtc } = await service
    .from('evaluation_ptc_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('term_id', t1.id);

  if ((existingPtc ?? 0) === 0) {
    const { data: sections } = await service
      .from('sections')
      .select('id')
      .eq('academic_year_id', testAy.id);
    const sectionIds = ((sections ?? []) as Array<{ id: string }>).map((r) => r.id);

    const PTC_NOTES = [
      'Parent shared that homework time at home has been productive. Asked for more reading recommendations for the holidays.',
      'Family travel scheduled mid-T2 — adviser to send catch-up materials. Parent grateful for the heads-up call.',
      'Parent observed improved confidence at home. Asked for ways to strengthen Math foundations over the break.',
      'Discussed peer-relationship dynamics; parent will reinforce the school virtue at home. Adviser to follow up next month.',
      'Parent thanked the team for the timely intervention. Will review the recommendations with the student over the weekend.',
    ];
    const rand = mulberry32(hashString(`${testAy.ay_code}:ptc`));
    const ptcRows: Array<Record<string, unknown>> = [];

    for (const sectionId of sectionIds) {
      const { data: enrolments } = await service
        .from('section_students')
        .select('student_id')
        .eq('section_id', sectionId)
        .limit(5);
      const students = ((enrolments ?? []) as Array<{ student_id: string }>);
      // ~half the section has a PTC note recorded.
      const targetCount = Math.max(1, Math.floor(students.length * 0.5));
      for (let i = 0; i < targetCount; i++) {
        ptcRows.push({
          term_id: t1.id,
          student_id: students[i].student_id,
          section_id: sectionId,
          feedback: PTC_NOTES[Math.floor(rand() * PTC_NOTES.length)],
        });
      }
    }

    if (ptcRows.length > 0) {
      const { error } = await service.from('evaluation_ptc_feedback').insert(ptcRows);
      if (error) {
        console.error('[demo-extras] ptc feedback insert failed:', error.message);
      } else {
        ptcInserted = ptcRows.length;
      }
    }
  }

  return { terms: termsInserted, writeupsT2, ptc: ptcInserted };
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Calendar enhancements — typed events + audience overrides + tentative.
// ─────────────────────────────────────────────────────────────────────────

async function seedCalendarEnhancements(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<{ events: number; audienceOverrides: number }> {
  const { data: termRows } = await service
    .from('terms')
    .select('id, term_number, start_date, end_date')
    .eq('academic_year_id', testAy.id)
    .order('term_number');
  const terms = (termRows ?? []) as Array<{
    id: string;
    term_number: number;
    start_date: string;
    end_date: string;
  }>;
  const t1 = terms.find((t) => t.term_number === 1);
  const t2 = terms.find((t) => t.term_number === 2);
  if (!t1) return { events: 0, audienceOverrides: 0 };

  const dateOffset = (base: string, days: number): string => {
    const d = new Date(`${base}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // ---- 5a. Typed events ----
  // Skip-guard: count existing events scoped to this AY's terms.
  const termIds = terms.map((t) => t.id);
  const { count: existingEvents } = await service
    .from('calendar_events')
    .select('id', { count: 'exact', head: true })
    .in('term_id', termIds)
    .neq('category', 'other'); // base seeder writes only 'other'-category events

  let eventsInserted = 0;
  if ((existingEvents ?? 0) === 0) {
    const eventRows: Array<Record<string, unknown>> = [
      // T1 typed events — anchor near the term boundaries so they appear
      // alongside the existing canned events.
      {
        term_id: t1.id,
        start_date: dateOffset(t1.start_date, 0),
        end_date: dateOffset(t1.start_date, 0),
        label: 'Start of Term 1',
        category: 'start_of_term',
        audience: 'all',
        tentative: false,
      },
      {
        term_id: t1.id,
        start_date: dateOffset(t1.end_date, -10),
        end_date: dateOffset(t1.end_date, -6),
        label: 'T1 Examinations',
        category: 'term_exam',
        audience: 'all',
        tentative: false,
      },
      {
        term_id: t1.id,
        start_date: dateOffset(t1.start_date, 35),
        end_date: dateOffset(t1.start_date, 35),
        label: 'Parents Dialogue (T1)',
        category: 'parents_dialogue',
        audience: 'all',
        tentative: false,
      },
      {
        term_id: t1.id,
        start_date: dateOffset(t1.start_date, 50),
        end_date: dateOffset(t1.start_date, 54),
        label: 'PFE Week',
        category: 'pfe',
        audience: 'all',
        tentative: false,
      },
      {
        term_id: t1.id,
        start_date: dateOffset(t1.start_date, 25),
        end_date: dateOffset(t1.start_date, 25),
        label: 'Sports Day',
        category: 'school_event',
        audience: 'all',
        tentative: false,
      },
      // Tentative event — a placeholder PTC date the registrar will confirm.
      {
        term_id: t1.id,
        start_date: dateOffset(t1.end_date, -2),
        end_date: dateOffset(t1.end_date, -2),
        label: 'Parent-Teacher Conference (tentative)',
        category: 'ptc',
        audience: 'all',
        tentative: true,
      },
    ];

    if (t2) {
      eventRows.push(
        {
          term_id: t2.id,
          start_date: dateOffset(t2.start_date, 0),
          end_date: dateOffset(t2.start_date, 0),
          label: 'Start of Term 2',
          category: 'start_of_term',
          audience: 'all',
          tentative: false,
        },
        {
          term_id: t2.id,
          start_date: dateOffset(t2.start_date, 20),
          end_date: dateOffset(t2.start_date, 24),
          label: 'Subject Week — Sciences',
          category: 'subject_week',
          audience: 'secondary',
          tentative: false,
        },
        {
          term_id: t2.id,
          start_date: dateOffset(t2.start_date, 30),
          end_date: dateOffset(t2.start_date, 32),
          label: 'Term Break',
          category: 'term_break',
          audience: 'all',
          tentative: false,
        },
      );
    }

    const { error } = await service.from('calendar_events').insert(eventRows);
    if (error) {
      console.error('[demo-extras] calendar_events insert failed:', error.message);
    } else {
      eventsInserted = eventRows.length;
    }
  }

  // ---- 5b. Audience-specific school_calendar overrides ----
  // Add a primary-only HBL day + a secondary-only HBL day mid-T1. These
  // sit alongside the existing 'all'-audience rows for the same dates;
  // the audience precedence rule (KD #50/#76) makes them the effective
  // attendance row for matching sections.
  let audienceOverrides = 0;
  const primaryHblDate = dateOffset(t1.start_date, 18);
  const secondaryHblDate = dateOffset(t1.start_date, 22);
  const overrideRows = [
    {
      term_id: t1.id,
      date: primaryHblDate,
      day_type: 'hbl',
      audience: 'primary',
      label: 'Primary HBL — facility maintenance',
    },
    {
      term_id: t1.id,
      date: secondaryHblDate,
      day_type: 'hbl',
      audience: 'secondary',
      label: 'Secondary HBL — staff training',
    },
  ];

  for (const r of overrideRows) {
    // Skip-guard per (term, audience, date) — unique key after migration 037.
    const { count } = await service
      .from('school_calendar')
      .select('id', { count: 'exact', head: true })
      .eq('term_id', r.term_id)
      .eq('audience', r.audience)
      .eq('date', r.date);
    if ((count ?? 0) > 0) continue;

    const { error } = await service.from('school_calendar').insert(r);
    if (error) {
      console.warn(
        `[demo-extras] audience override insert failed (${r.audience} ${r.date}):`,
        error.message,
      );
      continue;
    }
    audienceOverrides += 1;
  }

  return { events: eventsInserted, audienceOverrides };
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Enrollment-status mix — flip a few rows to late_enrollee + withdrawn.
//
// PP6's late-enrollee caption (score-entry grid amber italic line) and
// PP9's "withdrawn rows go to the bottom" sub-feature of the re-alphabetize
// button + KD #68's "· T2" amber suffix on Records placement section all
// need real `enrollment_status != 'active'` rows to render against.
// The base seedPopulated path leaves every row 'active'.
//
// Strategy: pick the FIRST section per AY (deterministic for demos) and
// flip its last 3 active students to late_enrollee + the next 2 to
// withdrawn. Bounded blast radius (5 rows out of 200), and the demo can
// always hit /sis/sections/[id] for a known section that visibly shows
// both states.
//
// Idempotent: counts existing non-active rows in the AY's sections; skips
// if any are present.
// ─────────────────────────────────────────────────────────────────────────

async function seedEnrollmentStatusMix(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<{ late: number; withdrawn: number }> {
  // Find sections in this AY, ordered for determinism.
  const { data: sections } = await service
    .from('sections')
    .select('id, name')
    .eq('academic_year_id', testAy.id)
    .order('name')
    .limit(1);
  const targetSection = (sections ?? [])[0];
  if (!targetSection) return { late: 0, withdrawn: 0 };

  // Skip-guard: any non-active row in this section already?
  const { count: existingNonActive } = await service
    .from('section_students')
    .select('id', { count: 'exact', head: true })
    .eq('section_id', targetSection.id)
    .neq('enrollment_status', 'active');
  if ((existingNonActive ?? 0) > 0) return { late: 0, withdrawn: 0 };

  // Pull active students in this section, ordered by index_number desc so
  // we flip the LAST few rows (lowest visibility in alphabetical lists,
  // which is the demo point — re-alphabetize pushes them down further).
  const { data: rows } = await service
    .from('section_students')
    .select('id, index_number')
    .eq('section_id', targetSection.id)
    .eq('enrollment_status', 'active')
    .order('index_number', { ascending: false })
    .limit(5);
  const candidates = (rows ?? []) as Array<{ id: string; index_number: number }>;
  if (candidates.length < 5) return { late: 0, withdrawn: 0 };

  // Term dates so the flip dates land plausibly in T2.
  const { data: termRows } = await service
    .from('terms')
    .select('term_number, start_date')
    .eq('academic_year_id', testAy.id)
    .order('term_number');
  const t2 = (termRows ?? []).find((t) => t.term_number === 2) as
    | { start_date: string }
    | undefined;
  const lateEnrolDate =
    t2?.start_date ?? new Date().toISOString().slice(0, 10);
  const withdrawDate = lateEnrolDate; // Same window — both happen in early T2.

  const lateRows = candidates.slice(0, 3);
  const withdrawnRows = candidates.slice(3, 5);

  let lateInserted = 0;
  for (const r of lateRows) {
    const { error } = await service
      .from('section_students')
      .update({ enrollment_status: 'late_enrollee', enrollment_date: lateEnrolDate })
      .eq('id', r.id);
    if (!error) lateInserted += 1;
  }

  let withdrawnInserted = 0;
  for (const r of withdrawnRows) {
    const { error } = await service
      .from('section_students')
      .update({ enrollment_status: 'withdrawn', withdrawal_date: withdrawDate })
      .eq('id', r.id);
    if (!error) withdrawnInserted += 1;
  }

  return { late: lateInserted, withdrawn: withdrawnInserted };
}

// ─────────────────────────────────────────────────────────────────────────
// 7. Change requests — ~12 rows across the 5 status buckets.
//
// CLAUDE.md flagged this as deferred: the change-request workflow is one
// of the headline pain-point fixes (PP7 / KD #25 / Hard Rule #5) but the
// table is empty in seed data, so /markbook/change-requests + the dashboard
// CR KPI tile + drill all show empty states.
//
// Strategy: pick LOCKED grading sheets in the AY (T1 sheets get locked
// during seedPopulated). Pull a handful of grade_entries from each. Create
// 12 CRs with a status mix that lights up every tab + KPI:
//   4 pending          (no review fields; recent requested_at)
//   3 approved         (review fields filled; not yet applied)
//   3 applied          (review + apply fields; older requested_at)
//   1 rejected         (review fields with decision_note)
//   1 cancelled        (no review; teacher pulled it back)
//
// requested_by needs a teacher user id; reviewed_by/applied_by need a
// school_admin/superadmin id; primary/secondary approver ids come from
// approver_assignments where flow='markbook.change_request'. We fetch
// each with a fallback to a sentinel UUID + sentinel email so the seeder
// works even on a fresh AY with no users yet (rare but safer).
//
// Idempotent: counts existing CRs against this AY's grading_sheets; skips
// if any are present.
// ─────────────────────────────────────────────────────────────────────────

const CR_FIELDS = ['ww_scores', 'pt_scores', 'qa_score', 'letter_grade'] as const;
const CR_REASONS = [
  'regrading',
  'data_entry_error',
  'late_submission',
  'academic_appeal',
  'other',
] as const;
type CrField = (typeof CR_FIELDS)[number];
type CrReason = (typeof CR_REASONS)[number];

const CR_JUSTIFICATIONS: Record<CrReason, string> = {
  regrading:
    'Parent requested a re-grade after meeting with the subject teacher; revised score reflects the standard rubric applied uniformly across the section.',
  data_entry_error:
    'Original entry was a transcription typo from the paper booklet — correcting to the actual mark recorded on the assessment.',
  late_submission:
    'Student submitted within the agreed extension window for compassionate circumstances; teacher confirmed timestamp via the LMS audit trail.',
  academic_appeal:
    'Formal appeal lodged by the family per the Term 1 grading rubric; HOD reviewed and recommended adjustment to the rubric application.',
  other:
    'Adjustment per the closed-doors discussion with the academic head and parent representative; supporting note attached to the request.',
};

const SENTINEL_TEACHER_UUID = '00000000-0000-0000-0000-00000000ce01';
const SENTINEL_REVIEWER_UUID = '00000000-0000-0000-0000-00000000ce02';
const SENTINEL_TEACHER_EMAIL = 'teacher.seed@hfse.test';
const SENTINEL_REVIEWER_EMAIL = 'registrar.seed@hfse.test';

async function pickSeedActor(
  service: SupabaseClient,
  roleNeeded: 'teacher' | 'school_admin',
): Promise<{ id: string; email: string }> {
  // auth.admin.listUsers is the only way to filter by app_metadata.role
  // server-side. Caps at 200 users — fine for HFSE's scale.
  const { data } = await service.auth.admin.listUsers({ perPage: 200 });
  const candidates = (data?.users ?? []).filter((u) => {
    const meta = (u.app_metadata as Record<string, unknown> | null) ?? {};
    if (roleNeeded === 'teacher') return meta.role === 'teacher';
    return meta.role === 'school_admin' || meta.role === 'superadmin';
  });
  const pick = candidates[0];
  if (pick) return { id: pick.id, email: pick.email ?? '' };
  return roleNeeded === 'teacher'
    ? { id: SENTINEL_TEACHER_UUID, email: SENTINEL_TEACHER_EMAIL }
    : { id: SENTINEL_REVIEWER_UUID, email: SENTINEL_REVIEWER_EMAIL };
}

async function seedChangeRequests(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  // Find locked T1 grading sheets in this AY (T1 is the closed term per
  // seedGradeEntries — exactly the surface where post-lock change requests
  // are realistic).
  const { data: sheets } = await service
    .from('grading_sheets')
    .select('id, locked_at, term:terms!inner(academic_year_id, term_number)')
    .eq('term.academic_year_id', testAy.id)
    .eq('term.term_number', 1)
    .not('locked_at', 'is', null)
    .limit(20);
  const lockedSheets = (sheets ?? []) as Array<{ id: string; locked_at: string }>;
  if (lockedSheets.length === 0) return 0;

  // Skip-guard: any CRs against these sheets already?
  const sheetIds = lockedSheets.map((s) => s.id);
  const { count: existingCrs } = await service
    .from('grade_change_requests')
    .select('id', { count: 'exact', head: true })
    .in('grading_sheet_id', sheetIds);
  if ((existingCrs ?? 0) > 0) return 0;

  // Pull grade_entries from these sheets — we need 12, take 30 to leave
  // headroom for shuffle + skip on shape mismatch.
  const { data: entries } = await service
    .from('grade_entries')
    .select('id, grading_sheet_id, ww_scores, pt_scores, qa_score, letter_grade')
    .in('grading_sheet_id', sheetIds)
    .limit(30);
  const candidateEntries = (entries ?? []) as Array<{
    id: string;
    grading_sheet_id: string;
    ww_scores: (number | null)[] | null;
    pt_scores: (number | null)[] | null;
    qa_score: number | null;
    letter_grade: string | null;
  }>;
  if (candidateEntries.length === 0) return 0;

  // Resolve actors (teacher requester + reviewer/applier).
  const teacher = await pickSeedActor(service, 'teacher');
  const reviewer = await pickSeedActor(service, 'school_admin');

  // Approvers for the markbook.change_request flow (designated pool per KD #41).
  // The /markbook/change-requests page filters seeded CRs to "where I'm
  // primary or secondary approver" — so if no approver_assignments exist,
  // the seeded CRs would render an empty inbox even though the sidebar
  // count is correct. Auto-bootstrap up to 2 school_admin/superadmin users
  // into the assignments table when fewer than 2 are configured, so the
  // demo always has visible CRs without manual setup.
  const { data: assignmentsRaw } = await service
    .from('approver_assignments')
    .select('user_id')
    .eq('flow', 'markbook.change_request')
    .order('created_at');
  const existingApproverIds = ((assignmentsRaw ?? []) as Array<{ user_id: string }>).map(
    (a) => a.user_id,
  );

  if (existingApproverIds.length < 2) {
    // Pull any school_admin/superadmin users not already assigned and
    // top up to 2. Service role bypasses RLS write-deny on this table.
    const { data: usersData } = await service.auth.admin.listUsers({ perPage: 200 });
    const eligible = (usersData?.users ?? [])
      .filter((u) => {
        const meta = (u.app_metadata as Record<string, unknown> | null) ?? {};
        return meta.role === 'school_admin' || meta.role === 'superadmin';
      })
      .map((u) => u.id)
      .filter((id) => !existingApproverIds.includes(id));

    const needed = 2 - existingApproverIds.length;
    const toAdd = eligible.slice(0, needed);
    if (toAdd.length > 0) {
      const inserts = toAdd.map((userId) => ({
        flow: 'markbook.change_request',
        user_id: userId,
      }));
      const { error } = await service.from('approver_assignments').insert(inserts);
      if (error) {
        console.warn(
          '[demo-extras] approver_assignments bootstrap failed:',
          error.message,
        );
      } else {
        existingApproverIds.push(...toAdd);
      }
    }
  }

  const primaryApproverId = existingApproverIds[0] ?? reviewer.id;
  const secondaryApproverId = existingApproverIds[1] ?? null;

  // Status mix — totals 12, lights up every tab.
  const statusMix: Array<'pending' | 'approved' | 'applied' | 'rejected' | 'cancelled'> = [
    'pending', 'pending', 'pending', 'pending',
    'approved', 'approved', 'approved',
    'applied', 'applied', 'applied',
    'rejected',
    'cancelled',
  ];

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const inserts: Array<Record<string, unknown>> = [];

  for (let i = 0; i < statusMix.length && i < candidateEntries.length; i++) {
    const status = statusMix[i];
    const e = candidateEntries[i];

    // Pick a field/reason from rotating positions so the facets have variety.
    const field: CrField = CR_FIELDS[i % CR_FIELDS.length];
    const reason: CrReason = CR_REASONS[i % CR_REASONS.length];

    // current_value snapshot + plausible proposed_value per field.
    let currentValue: string | null = null;
    let proposedValue = '';
    let slotIndex: number | null = null;
    if (field === 'ww_scores' || field === 'pt_scores') {
      const arr = (field === 'ww_scores' ? e.ww_scores : e.pt_scores) ?? [];
      slotIndex = 0;
      const cur = arr[0];
      currentValue = cur == null ? null : String(cur);
      proposedValue = String(Math.min(10, Math.max(0, (cur ?? 6) + 1)));
    } else if (field === 'qa_score') {
      currentValue = e.qa_score == null ? null : String(e.qa_score);
      proposedValue = String(Math.min(30, Math.max(0, (e.qa_score ?? 22) + 2)));
    } else {
      currentValue = e.letter_grade;
      proposedValue = e.letter_grade === 'A' ? 'A+' : 'A';
    }

    // Timestamps: pending = recent; approved/applied/rejected = older;
    // cancelled = oldest. Spread across 14 days for the date-range filter
    // in the change-requests page to have something to bite.
    const ageDays =
      status === 'pending' ? i % 4
      : status === 'approved' ? 5 + (i % 3)
      : status === 'applied' ? 9 + (i % 3)
      : status === 'rejected' ? 7
      : 12;
    const requestedAt = new Date(now - ageDays * day).toISOString();
    const reviewedAt =
      status === 'approved' || status === 'applied' || status === 'rejected'
        ? new Date(now - (ageDays - 1) * day).toISOString()
        : null;
    const appliedAt =
      status === 'applied'
        ? new Date(now - (ageDays - 2) * day).toISOString()
        : null;

    inserts.push({
      grading_sheet_id: e.grading_sheet_id,
      grade_entry_id: e.id,
      field_changed: field,
      slot_index: slotIndex,
      current_value: currentValue,
      proposed_value: proposedValue,
      reason_category: reason,
      justification: CR_JUSTIFICATIONS[reason],
      status,
      requested_by: teacher.id,
      requested_by_email: teacher.email,
      requested_at: requestedAt,
      reviewed_by: reviewedAt ? reviewer.id : null,
      reviewed_by_email: reviewedAt ? reviewer.email : null,
      reviewed_at: reviewedAt,
      decision_note:
        status === 'rejected'
          ? 'Rubric was applied correctly per the moderation notes; no adjustment warranted.'
          : status === 'approved' || status === 'applied'
            ? 'Approved per the Term 1 standard rubric. Apply when the registrar opens the sheet.'
            : null,
      applied_by: appliedAt ? reviewer.id : null,
      applied_at: appliedAt,
      primary_approver_id: primaryApproverId,
      secondary_approver_id: secondaryApproverId,
    });
  }

  if (inserts.length === 0) return 0;

  const { error, count } = await service
    .from('grade_change_requests')
    .insert(inserts, { count: 'exact' });
  if (error) {
    console.warn('[demo-extras] change-requests insert failed:', error.message);
    return 0;
  }
  return count ?? inserts.length;
}

// ─────────────────────────────────────────────────────────────────────────
// 8. Vacation-leave attendance entries (KD #94).
//
// Without this pass the attendance dashboard's VacationLeaveQuotaCard
// shows zero entries, undermining the demo of the EX:vacation subtype +
// per-term quota. Flips ~1 existing P entry per student in T1 of one
// target section to EX:vacation — one VL per student means quota is at
// its limit (HFSE policy: 1 per term), so the card surfaces every student
// as "at limit" (mint badge).
//
// Idempotent: skips if any vacation-tagged entries already exist for
// this AY's terms.
// ─────────────────────────────────────────────────────────────────────────

async function seedVacationLeaveEntries(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  // Target the term that the attendance dashboard's VacationLeaveQuotaCard
  // actually reads — `is_current` term, falling back to T1. Earlier this
  // pass hardcoded T1, which meant the card showed zero entries whenever
  // T2 was the current term (which is the default state right after env
  // switch, since the temporal split logic puts AY9999 mid-T2).
  const { data: termRows } = await service
    .from('terms')
    .select('id, term_number, is_current')
    .eq('academic_year_id', testAy.id)
    .order('term_number');
  const terms = (termRows ?? []) as Array<{
    id: string;
    term_number: number;
    is_current: boolean;
  }>;
  if (terms.length === 0) return 0;
  const currentTerm = terms.find((t) => t.is_current) ?? terms[0];
  if (!currentTerm) return 0;
  const targetTermId = currentTerm.id;

  // Skip-guard: any vacation entries already in the target term?
  const { count: existing } = await service
    .from('attendance_daily')
    .select('id', { count: 'exact', head: true })
    .eq('term_id', targetTermId)
    .eq('ex_reason', 'vacation');
  if ((existing ?? 0) > 0) return 0;

  // Pick the first section (alphabetical), and from it the first 10
  // active section_students.
  const { data: sectionRow } = await service
    .from('sections')
    .select('id, name')
    .eq('academic_year_id', testAy.id)
    .order('name')
    .limit(1)
    .maybeSingle();
  if (!sectionRow) return 0;
  const sectionId = (sectionRow as { id: string }).id;

  const { data: students } = await service
    .from('section_students')
    .select('id')
    .eq('section_id', sectionId)
    .eq('enrollment_status', 'active')
    .order('index_number')
    .limit(10);
  const ssIds = ((students ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (ssIds.length === 0) return 0;

  // Update one existing P entry per student in the target term to
  // EX:vacation. We update in place (no new rows) so the daily ledger
  // total stays the same — mirrors how Joann reclassifies entries
  // after seeing a parent leave request.
  let flipped = 0;
  for (const ssId of ssIds) {
    const { data: candidate } = await service
      .from('attendance_daily')
      .select('id')
      .eq('section_student_id', ssId)
      .eq('term_id', targetTermId)
      .eq('status', 'P')
      .order('date')
      .limit(1)
      .maybeSingle();
    if (!candidate) continue;
    const { error } = await service
      .from('attendance_daily')
      .update({ status: 'EX', ex_reason: 'vacation' })
      .eq('id', (candidate as { id: string }).id);
    if (!error) {
      flipped += 1;
      await service.rpc('recompute_attendance_rollup', {
        p_term_id: targetTermId,
        p_section_student_id: ssId,
      });
    }
  }
  return flipped;
}

// ─────────────────────────────────────────────────────────────────────────
// 9. Evaluation checklist topics (KD #93).
//
// Migration 047 made topics teacher-owned per (section × subject × term).
// Without seeded topics, /evaluation/sections/[id]?tab=checklists shows
// the empty "Add your first topic" state — undermines the per-topic 1-5
// rating UI demo.
//
// Seeds 6 plausible topics on T1 × Math × first section. created_by is
// set to the subject_teacher's user id (resolved via teacher_assignments)
// so the topic-manager UI sees them as the teacher's own topics.
// ─────────────────────────────────────────────────────────────────────────

const EVAL_TOPIC_TEMPLATES = [
  'Understands core concepts and applies them confidently in class work.',
  'Participates actively in class discussions and group activities.',
  'Completes homework on time with clear, organised solutions.',
  'Demonstrates problem-solving strategies beyond the worked examples.',
  'Shows attention to detail and care in written work.',
  'Asks thoughtful questions and helps peers when they struggle.',
];

type EvalTopicSeedResult = {
  topics: number;
  termId: string | null;
  sectionId: string | null;
  subjectId: string | null;
  topicIds: string[];
};

async function seedEvaluationTopics(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<EvalTopicSeedResult> {
  const empty: EvalTopicSeedResult = {
    topics: 0,
    termId: null,
    sectionId: null,
    subjectId: null,
    topicIds: [],
  };

  const { data: termIds } = await service
    .from('terms')
    .select('id, term_number')
    .eq('academic_year_id', testAy.id)
    .order('term_number');
  const ayTermIds = (termIds ?? []) as Array<{ id: string; term_number: number }>;
  if (ayTermIds.length === 0) return empty;
  const t1 = ayTermIds.find((t) => t.term_number === 1);
  if (!t1) return empty;

  // Skip-guard: any topics already exist in this AY's terms? If yes,
  // resolve enough context for the ratings pass to find the same topics.
  const { count: existing } = await service
    .from('evaluation_checklist_items')
    .select('id', { count: 'exact', head: true })
    .in('term_id', ayTermIds.map((t) => t.id));
  if ((existing ?? 0) > 0) {
    const { data: existingItems } = await service
      .from('evaluation_checklist_items')
      .select('id, term_id, subject_id, section_id')
      .in('term_id', ayTermIds.map((t) => t.id))
      .order('sort_order')
      .limit(6);
    const items = (existingItems ?? []) as Array<{
      id: string;
      term_id: string;
      subject_id: string;
      section_id: string;
    }>;
    if (items.length === 0) return empty;
    return {
      topics: 0,
      termId: items[0].term_id,
      sectionId: items[0].section_id,
      subjectId: items[0].subject_id,
      topicIds: items.map((i) => i.id),
    };
  }

  const { data: sectionRow } = await service
    .from('sections')
    .select('id, level_id')
    .eq('academic_year_id', testAy.id)
    .order('name')
    .limit(1)
    .maybeSingle();
  if (!sectionRow) return empty;
  const sectionId = (sectionRow as { id: string; level_id: string }).id;
  const levelId = (sectionRow as { id: string; level_id: string }).level_id;

  const { data: subjectRow } = await service
    .from('subjects')
    .select('id')
    .eq('code', 'MATH')
    .maybeSingle();
  if (!subjectRow) return empty;
  const subjectId = (subjectRow as { id: string }).id;

  // Verify the subject is configured for this level × AY.
  const { count: configCount } = await service
    .from('subject_configs')
    .select('id', { count: 'exact', head: true })
    .eq('academic_year_id', testAy.id)
    .eq('level_id', levelId)
    .eq('subject_id', subjectId);
  if ((configCount ?? 0) === 0) return empty;

  // Resolve the subject_teacher for this (section × subject) — used as
  // created_by so topic-manager UI shows them as "your own topics."
  const { data: assignmentRow } = await service
    .from('teacher_assignments')
    .select('teacher_user_id')
    .eq('section_id', sectionId)
    .eq('subject_id', subjectId)
    .eq('role', 'subject_teacher')
    .maybeSingle();
  const createdBy =
    (assignmentRow as { teacher_user_id: string } | null)?.teacher_user_id ?? null;

  const rows = EVAL_TOPIC_TEMPLATES.map((item_text, idx) => ({
    term_id: t1.id,
    subject_id: subjectId,
    section_id: sectionId,
    item_text,
    sort_order: idx + 1,
    created_by: createdBy,
  }));

  const { data: inserted, error } = await service
    .from('evaluation_checklist_items')
    .insert(rows)
    .select('id');
  if (error) {
    console.warn('[demo-extras] evaluation topics insert failed:', error.message);
    return empty;
  }
  const insertedRows = (inserted ?? []) as Array<{ id: string }>;
  return {
    topics: insertedRows.length,
    termId: t1.id,
    sectionId,
    subjectId,
    topicIds: insertedRows.map((r) => r.id),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 10. Evaluation ratings (KD #92).
//
// Populates evaluation_checklist_responses.rating (smallint 1-5) for
// every (student × topic) pair against the topics seeded in pass 9.
// Skewed positive — most ratings 4-5 with a tail of 3 and 2 — so the
// demo shows a healthy class without making the registrar's "needs
// improvement" chip count zero.
//
// Idempotent: upsert on the migration-046 unique
// (term_id, student_id, checklist_item_id).
// ─────────────────────────────────────────────────────────────────────────

async function seedEvaluationRatings(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
  context: EvalTopicSeedResult,
): Promise<number> {
  if (!context.termId || !context.sectionId || context.topicIds.length === 0) {
    return 0;
  }

  const { count: existing } = await service
    .from('evaluation_checklist_responses')
    .select('id', { count: 'exact', head: true })
    .in('checklist_item_id', context.topicIds);
  if ((existing ?? 0) > 0) return 0;

  const { data: studentsRaw } = await service
    .from('section_students')
    .select('student_id')
    .eq('section_id', context.sectionId)
    .eq('enrollment_status', 'active')
    .order('index_number');
  const studentIds = ((studentsRaw ?? []) as Array<{ student_id: string }>).map(
    (s) => s.student_id,
  );
  if (studentIds.length === 0) return 0;

  const rand = mulberry32(hashString(`${testAy.ay_code}:eval-ratings`));

  type ResponseRow = {
    term_id: string;
    student_id: string;
    section_id: string;
    checklist_item_id: string;
    rating: number;
  };
  const rows: ResponseRow[] = [];
  for (const studentId of studentIds) {
    for (const topicId of context.topicIds) {
      // 40% Excellent, 25% Good, 25% Satisfactory, 10% Developing.
      const r = rand();
      const rating = r < 0.4 ? 5 : r < 0.65 ? 4 : r < 0.9 ? 3 : 2;
      rows.push({
        term_id: context.termId,
        student_id: studentId,
        section_id: context.sectionId,
        checklist_item_id: topicId,
        rating,
      });
    }
  }

  const { error, count } = await service
    .from('evaluation_checklist_responses')
    .upsert(rows, {
      onConflict: 'term_id,student_id,checklist_item_id',
      ignoreDuplicates: true,
      count: 'exact',
    });
  if (error) {
    console.warn('[demo-extras] evaluation ratings insert failed:', error.message);
    return 0;
  }
  return count ?? rows.length;
}
