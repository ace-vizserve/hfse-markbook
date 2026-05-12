import type { SupabaseClient } from '@supabase/supabase-js';

import { hashString, mulberry32, prefixFor } from './random';

// Demo-extras seeder. Layered on top of seedPopulated() to fill the
// dashboard charts + KPIs that the existing seeder leaves thin. Targeted
// at the 1-hour CEO/user demo where the focus is "do dashboards look like
// real production usage."
//
// Five passes, all idempotent (skip-guarded by an existence count):
//   1. seedPublicationsExpanded   — 3 published report-card windows across T1+T2
//   2. seedParentAccounts         — 5 parent auth.users tied to enrolled emails
//   3. seedPFileLifecycle         — outreach rows + 60d/90d expiry buckets
//   4. seedEvaluationLifecycle    — T1 closed / T2 open / T2 partial writeups + PTC
//   5. seedCalendarEnhancements   — typed events + audience overrides + tentative
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
