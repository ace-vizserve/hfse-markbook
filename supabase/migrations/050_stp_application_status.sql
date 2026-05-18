-- 050_stp_application_status.sql
--
-- Drops STP documents from the enrollment process. Parents file STP
-- requirements directly with ICA via ICA's own portal; the school no
-- longer collects icaPhoto / financialSupportDocs / vaccinationInformation
-- as part of admissions. Instead, the school tracks STP progress via a
-- new `stpApplicationStatus` column on `ay{YY}_enrolment_applications`
-- (co-located with `stpApplicationType`, its sibling from migration 026
-- line 129). Values: 'Pending' | 'Submitted' | 'Approved' | 'Rejected'.
--
-- Why apps table, not status table: stpApplicationType already lives on
-- the apps row, so type + status belong together as one logical pair —
-- splitting them across two tables creates a JOIN dependency for every
-- consumer that only ever needs both. The SIS-side `applicationStatus`
-- on the status table is a different workflow column (KD #59); the STP
-- pair is its own mini-state-machine bolted on top of the apps form.
--
-- Scope: AY2026 (current ops) + AY2027 (upcoming early-bird per KD #77)
-- only. AY2025 is the closed historical year — applying STP tracking
-- retroactively would create misleading rows. Test AYs (AY9998 / AY9999)
-- are seeded fresh by the populated seeder; no migration backfill needed
-- there either. Future AYs (AY2028+) pick the column up via the patched
-- `create_ay_admissions_tables` RPC at AY-setup time.
--
-- The three slot columns on `ay{YY}_enrolment_documents` stay on the
-- schema (historical preservation — existing rows aren't touched). The
-- application code stops reading and writing them after this migration
-- (DOCUMENT_SLOTS no longer enumerates them; STP_CONDITIONAL_SLOT_KEYS
-- becomes empty).
--
-- Apply after 049. Safe to re-run.

-- =====================================================================
-- 1. Add stpApplicationStatus to AY2026 + AY2027 enrolment_applications
--    tables. Backfill 'Pending' for rows with stpApplicationType set.
--    Each table is guarded by `to_regclass` so the migration succeeds
--    even when an AY hasn't been created yet (fresh dev DB).
-- =====================================================================

do $$
declare
  v_table text;
  v_targets text[] := array['ay2026_enrolment_applications', 'ay2027_enrolment_applications'];
begin
  foreach v_table in array v_targets loop
    -- Skip when this AY hasn't been created yet on this database.
    if to_regclass('public.' || v_table) is null then
      raise notice 'skipping %, table does not exist', v_table;
      continue;
    end if;

    -- Column add (idempotent).
    execute format($ddl$
      alter table public.%I
        add column if not exists "stpApplicationStatus" text null
    $ddl$, v_table);

    -- CHECK constraint (drop-then-add so the migration re-runs cleanly
    -- and picks up future enum changes).
    execute format($ddl$
      alter table public.%I
        drop constraint if exists %I
    $ddl$, v_table, v_table || '_stpapp_status_chk');

    execute format($ddl$
      alter table public.%I
        add constraint %I
        check (
          "stpApplicationStatus" is null
          or "stpApplicationStatus" in ('Pending', 'Submitted', 'Approved', 'Rejected')
        )
    $ddl$, v_table, v_table || '_stpapp_status_chk');

    -- Backfill: every row that opted into the STP flow but hasn't been
    -- assigned a tracker state yet → seed 'Pending' so the registrar
    -- has a starting point. Non-STP rows stay NULL.
    execute format($sql$
      update public.%I
      set "stpApplicationStatus" = 'Pending'
      where "stpApplicationType" is not null
        and "stpApplicationStatus" is null
    $sql$, v_table);
  end loop;
end $$;

-- =====================================================================
-- 2. Patch create_ay_admissions_tables so AY2028+ ship with the
--    column already defined. The function lives in migration 026; we
--    re-emit only the enrolment_applications block here adding the
--    new column + CHECK. Other blocks (status / documents /
--    discount_codes) are NOT re-emitted — their CREATE TABLE IF NOT
--    EXISTS in 026 stays authoritative.
--
-- If migration 026 is ever updated, this block must mirror those
-- changes. Cross-link comment added there as well.
-- =====================================================================

create or replace function public.create_ay_admissions_tables(p_ay_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(p_ay_slug));
  v_table text;
  v_tables text[] := array[
    'enrolment_applications',
    'enrolment_status',
    'enrolment_documents',
    'discount_codes'
  ];
begin
  if v_slug !~ '^ay[0-9]{4}$' then
    raise exception 'Invalid AY slug: %. Expected format like "ay2027".', p_ay_slug;
  end if;

  -- ay{YYYY}_enrolment_applications — adds "stpApplicationStatus" + CHECK.
  -- Mirrors migration 026 with the one extra column inline (so this function
  -- stays the single canonical creator — re-emitting all 4 tables keeps the
  -- create_or_replace correct and AY-setup wiring intact).
  execute format($ddl$
    create table if not exists public.%I (
      id bigint generated by default as identity not null,
      created_at timestamp with time zone null default (now() at time zone 'Asia/Singapore'::text),
      category character varying null,
      "enroleeNumber" text null,
      "studentNumber" text null,
      "enroleeFullName" text null,
      "lastName" text null,
      "firstName" text null,
      "middleName" text null,
      "preferredName" text null,
      "levelApplied" text null,
      "classType" text null,
      "preferredSchedule" text null,
      "birthDay" date null,
      gender text null,
      "passportNumber" text null,
      "passportExpiry" date null,
      nationality text null,
      religion text null,
      "religionOther" text null,
      nric text null,
      pass text null,
      "passExpiry" date null,
      "homeAddress" text null,
      "postalCode" bigint null,
      "homePhone" bigint null,
      "contactPerson" text null,
      "contactPersonNumber" bigint null,
      "primaryLanguage" text null,
      "parentMaritalStatus" text null,
      "livingWithWhom" text null,
      "fatherFullName" text null, "fatherLastName" text null, "fatherFirstName" text null,
      "fatherMiddleName" text null, "fatherPreferredName" text null, "fatherBirthDay" date null,
      "fatherPassport" text null, "fatherPassportExpiry" date null, "fatherNric" text null,
      "fatherPass" text null, "fatherPassExpiry" date null, "fatherCompanyName" text null,
      "fatherPosition" text null, "fatherNationality" text null, "fatherReligion" text null,
      "fatherMobile" bigint null, "fatherEmail" text null, "fatherMarital" text null,
      "motherFullName" text null, "motherLastName" text null, "motherFirstName" text null,
      "motherMiddleName" text null, "motherPreferredName" text null, "motherBirthDay" date null,
      "motherPassport" text null, "motherPassportExpiry" date null, "motherNric" text null,
      "motherPass" text null, "motherPassExpiry" date null, "motherCompanyName" text null,
      "motherPosition" text null, "motherNationality" text null, "motherReligion" text null,
      "motherMobile" bigint null, "motherEmail" text null, "motherMarital" text null,
      "guardianFullName" text null, "guardianLastName" text null, "guardianFirstName" text null,
      "guardianMiddleName" text null, "guardianPreferredName" text null, "guardianBirthDay" date null,
      "guardianPassport" text null, "guardianPassportExpiry" date null, "guardianNric" text null,
      "guardianPass" text null, "guardianPassExpiry" date null, "guardianCompanyName" text null,
      "guardianPosition" text null, "guardianNationality" text null, "guardianReligion" text null,
      "guardianMobile" bigint null, "guardianEmail" text null,
      "siblingFullName1" text null, "siblingBirthDay1" date null, "siblingReligion1" text null,
      "siblingEducationOccupation1" text null, "siblingSchoolCompany1" text null,
      "siblingFullName2" text null, "siblingBirthDay2" date null, "siblingReligion2" text null,
      "siblingEducationOccupation2" text null, "siblingSchoolCompany2" text null,
      "siblingFullName3" text null, "siblingBirthDay3" date null, "siblingReligion3" text null,
      "siblingEducationOccupation3" text null, "siblingSchoolCompany3" text null,
      "siblingFullName4" text null, "siblingBirthDay4" date null, "siblingReligion4" text null,
      "siblingEducationOccupation4" text null, "siblingSchoolCompany4" text null,
      "siblingFullName5" text null, "siblingBirthDay5" date null, "siblingReligion5" text null,
      "siblingEducationOccupation5" text null, "siblingSchoolCompany5" text null,
      "availSchoolBus" text null, "availUniform" text null, "availStudentCare" text null,
      "additionalLearningNeeds" text null, "previousSchool" text null,
      "documentsStatus" text null, "registrationInvoice" text null,
      "registrationInvoiceDate" date null, "assessmentDate" date null,
      "assessmentStatus" text null, "startDate" text null,
      "enrollmentInvoice" text null, "enrollmentInvoiceDate" date null,
      "acctsRemarks" text null, "enroleePhoto" text null, "creatorUid" text null,
      "howDidYouKnowAboutHFSEIS" text null, "otherSource" text null,
      "applicationStatus" text null,
      "fatherReligionOther" text null, "motherReligionOther" text null, "guardianReligionOther" text null,
      "passCodeStudent" text null,
      discount1 text null, discount2 text null, discount3 text null,
      "referrerName" text null, "paymentOption" text null, "referrerMobile" text null,
      "contractSignatory" text null, "vizSchoolProgram" text null,
      "feedbackRating" smallint null, "feedbackComments" text null,
      "feedbackConsent" boolean null, "feedbackSubmittedAt" timestamp without time zone null,
      "preCourseAnswer" text null, "preCourseDate" timestamp without time zone null,
      "preCourseAcknowledgedAt" timestamp without time zone null,
      "stpApplicationType" text null,
      "stpApplicationStatus" text null,
      allergies boolean null, "allergyDetails" text null, asthma boolean null,
      "foodAllergies" boolean null, "foodAllergyDetails" text null,
      "heartConditions" boolean null, epilepsy boolean null, diabetes boolean null, eczema boolean null,
      "otherMedicalConditions" text null, "paracetamolConsent" boolean null,
      "otherLearningNeeds" text null, "studentCareProgram" text null,
      "socialMediaConsent" boolean null,
      "guardianWhatsappTeamsConsent" boolean null,
      "fatherWhatsappTeamsConsent" boolean null,
      "motherWhatsappTeamsConsent" boolean null,
      "residenceHistory" jsonb null,
      "dietaryRestrictions" text null,
      constraint %I primary key (id),
      constraint %I check (
        "stpApplicationStatus" is null
        or "stpApplicationStatus" in ('Pending', 'Submitted', 'Approved', 'Rejected')
      )
    );
  $ddl$,
    v_slug || '_enrolment_applications',
    v_slug || '_enrolment_applications_pkey',
    v_slug || '_enrolment_applications_stpapp_status_chk');

  -- ay{YYYY}_enrolment_status — unchanged from migration 026.
  execute format($ddl$
    create table if not exists public.%I (
      id bigint generated by default as identity not null,
      created_at timestamp with time zone not null default now(),
      "enroleeNumber" text null,
      "enrolmentDate" date null,
      "enroleeName" text null,
      "applicationStatus" character varying null,
      "applicationRemarks" text null,
      "applicationUpdatedDate" date null,
      "applicationUpdatedBy" text null,
      "registrationStatus" character varying null,
      "registrationInvoice" text null,
      "registrationPaymentDate" date null,
      "registrationRemarks" text null,
      "registrationUpdateDate" date null,
      "registrationUpdatedby" text null,
      "documentStatus" character varying null,
      "documentRemarks" text null,
      "documentUpdatedDate" date null,
      "documentUpdatedby" text null,
      "assessmentStatus" character varying null,
      "assessmentSchedule" date null,
      "assessmentGradeMath" text null,
      "assessmentGradeEnglish" text null,
      "assessmentRemarks" text null,
      "assessmentMedical" text null,
      "assessmentUpdatedDate" date null,
      "assessmentUpdatedby" text null,
      "contractStatus" character varying null,
      "contractRemarks" text null,
      "contractUpdatedDate" date null,
      "contractUpdatedby" text null,
      "feeStatus" character varying null,
      "feeInvoice" text null,
      "feePaymentDate" date null,
      "feeStartDate" date null,
      "feeRemarks" text null,
      "feeUpdatedDate" date null,
      "feeUpdatedby" text null,
      "classStatus" character varying null,
      "classAY" character varying null,
      "classLevel" character varying null,
      "classSection" character varying null,
      "classRemarks" text null,
      "classUpdatedDate" date null,
      "classUpdatedby" text null,
      "suppliesStatus" character varying null,
      "suppliesClaimedDate" date null,
      "suppliesRemarks" text null,
      "suppliesUpdatedDate" date null,
      "suppliesUpdatedby" text null,
      "orientationStatus" character varying null,
      "orientationScheduleDate" date null,
      "orientationRemarks" text null,
      "orientationUpdatedDate" date null,
      "orientationUpdateby" text null,
      "enroleeType" character varying null,
      "levelApplied" text null,
      constraint %I primary key (id)
    );
  $ddl$, v_slug || '_enrolment_status', v_slug || '_enrolment_status_pkey');

  -- ay{YYYY}_enrolment_documents — unchanged from migration 026.
  -- (Includes the 3 STP slot columns for historical preservation; the
  -- application code stops reading/writing them per migration 050.)
  execute format($ddl$
    create table if not exists public.%I (
      id bigint generated by default as identity not null,
      created_at timestamp with time zone null default (now() at time zone 'Asia/Singapore'::text),
      "studentNumber" text null,
      "enroleeNumber" text null,
      form12 text null, "form12Status" character varying null,
      medical text null, "medicalStatus" character varying null,
      passport text null, "passportStatus" character varying null, "passportExpiry" date null,
      "birthCert" text null, "birthCertStatus" character varying null,
      pass text null, "passStatus" character varying null, "passExpiry" date null,
      "educCert" text null, "educCertStatus" character varying null,
      "motherPassport" text null, "motherPassportStatus" character varying null, "motherPassportExpiry" date null,
      "motherPass" text null, "motherPassStatus" character varying null, "motherPassExpiry" date null,
      "fatherPassport" text null, "fatherPassportStatus" character varying null, "fatherPassportExpiry" date null,
      "fatherPass" text null, "fatherPassStatus" character varying null, "fatherPassExpiry" date null,
      "guardianPassport" text null, "guardianPassportStatus" character varying null, "guardianPassportExpiry" date null,
      "guardianPass" text null, "guardianPassStatus" character varying null, "guardianPassExpiry" date null,
      "idPicture" text null, "idPictureStatus" character varying null, "idPictureUploadedDate" date null,
      "uploadFormDocument" uuid null,
      "icaPhoto" text null, "icaPhotoStatus" character varying null,
      "financialSupportDocs" text null, "financialSupportDocsStatus" character varying null,
      "vaccinationInformation" text null, "vaccinationInformationStatus" character varying null,
      constraint %I primary key (id)
    );
  $ddl$, v_slug || '_enrolment_documents', v_slug || '_enrolment_documents_pkey');

  -- ay{YYYY}_discount_codes — unchanged from migration 026.
  execute format($ddl$
    create table if not exists public.%I (
      id bigint generated by default as identity not null,
      created_at timestamp with time zone not null default now(),
      "discountCode" text null,
      "startDate" date null,
      "endDate" date null,
      details text null,
      "enroleeType" character varying null,
      constraint %I primary key (id)
    );
  $ddl$, v_slug || '_discount_codes', v_slug || '_discount_codes_pkey');

  -- Enable RLS + permissive policy on each table (mirrors migration 026).
  foreach v_table in array v_tables loop
    execute format(
      'alter table public.%I enable row level security',
      v_slug || '_' || v_table
    );

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = v_slug || '_' || v_table
        and policyname = 'Policy with security definer functions'
    ) then
      execute format($pol$
        create policy "Policy with security definer functions"
        on public.%I
        for all
        to public
        using (true)
        with check (true);
      $pol$, v_slug || '_' || v_table);
    end if;
  end loop;
end $$;

revoke all on function public.create_ay_admissions_tables(text) from public;
grant execute on function public.create_ay_admissions_tables(text) to service_role;

comment on function public.create_ay_admissions_tables is
  'Creates the full 4-table admissions set (applications / status / documents / discount_codes) for a new AY. The apps table now carries stpApplicationStatus tracking ICA Student Pass progress (Pending/Submitted/Approved/Rejected), co-located with stpApplicationType. Replaces the old icaPhoto+financialSupportDocs+vaccinationInformation document-slot model. KD #61 superseded.';
