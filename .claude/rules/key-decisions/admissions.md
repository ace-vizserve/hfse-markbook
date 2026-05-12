<!-- Topic file for `.claude/rules/key-decisions.md`. Numbering is global; do not renumber. -->

## Admissions — funnel, STP, chase, applicationStatus, early-bird AY

### KD #17
Admissions analytics consolidated into `/records`; `/admin*` redirects there. Superadmin-only CSV at `/api/admissions/export`. `08-admission-dashboard.md`.

### KD #18
Admissions read-only dashboard helpers in `lib/admissions/dashboard.ts` — `unstable_cache` 10-min TTL, tag `admissions-dashboard:${ayCode}`.

### KD #51
Admissions is its own module; Records is enrolled-only. `/admissions/*` hosts the pre-enrolment funnel (Inquiry → Applied → Interviewed → Offered → Accepted) + applicant-detail tabs. `/records/*` lists only Enrolled / Conditional and resolves cross-year history via `studentNumber` (Hard Rule #4) through `lib/sis/records-history.ts`. Dedicated `admissions` role on `Role` union + `ROUTE_ACCESS`. Module switcher derives allowed modules from `ROUTE_ACCESS` — never hardcode the allowed list.

### KD #59
Two `applicationStatus` columns with different value spaces. `ay{YY}_enrolment_applications.applicationStatus` is parent-portal-side (e.g. `"Registered"`). `ay{YY}_enrolment_status.applicationStatus` is the SIS-side workflow pipeline (`Submitted | Ongoing Verification | Processing | Enrolled | Enrolled (Conditional) | Cancelled | Withdrawn` per `lib/schemas/sis.ts::STAGE_STATUS_OPTIONS.application`). Drill loaders + dashboards + lifecycle widget read from the SIS-side column. Seeder must write both. See `14-modules-overview.md` Cross-module data contract.

### KD #61
STP application tracker (HFSE Edutrust Certified). `stpApplicationType` on `ay{YY}_enrolment_applications` gates 3 conditional document slots: `icaPhoto`, `financialSupportDocs`, `vaccinationInformation` (exported as `STP_CONDITIONAL_SLOT_KEYS` from `lib/sis/queries.ts`). When set the slots are required and surfaces expose them; when null they stay NULL and surfaces hide them. `residenceHistory` JSON column on apps row pairs with the 3 slots (ICA requires past 5 years of residency). `21-stp-application.md`.

### KD #62
`category` ↔ `enroleeType` mirror across applications + status; discount-codes catalog uses 6-value superset. `applications.category` and `status.enroleeType` always agree; both ∈ `{New, Current, VizSchool New, VizSchool Current}` (4 values, exported as `ENROLEE_CATEGORIES` from `lib/schemas/sis.ts`). `discount_codes.enroleeType` ∈ same 4 + `Both` + `VizSchool Both` (6 values, `DISCOUNT_ENROLEE_TYPES`). The `Both` entries apply to either New OR Current. Seeder must keep apps.category + status.enroleeType in sync per row.

### KD #69
Documents-stage parent-email-conditional gate. Extends KD #61's STP-conditional pattern to parent slots: father slots (`fatherPassport`, `fatherPass`) are skipped from the documents-Verified/Finished gate when `fatherEmail` is empty/null on the apps row; guardian slots (`guardianPassport`, `guardianPass`) when `guardianEmail` is empty/null. Mother stays always-required (anchor parent). Companion: `OPTIONAL_DOCUMENT_SLOT_KEYS` in `lib/sis/queries.ts` extended to include `'form12'` alongside `medical` + `educCert`.

### KD #70
Admissions chase scope split. Documents in two distinct workflows that share statuses but differ semantically: **chase** (parent owes us something) = `'To follow'` + `'Rejected'` + `'Expired'`; **awaiting validation** (we owe a review) = `'Uploaded'`. Admissions PriorityPanel ranks by chase-only signals so headlines aren't inflated by routine pending-review items. New `expired: number` counter on `AdmissionsCompleteness` + `'expired'` member of `AdmissionsChaseStatusFilter` + `?status=expired` sidebar quicklink. Sidebar's "Document validation" entry split per module — admissions → `/admissions?status=uploaded` (un-enrolled validation queue), P-Files → `/p-files?status=expired` (enrolled renewal queue). Phase-1 shared infra: notify/promise/bulk-notify routes accept `module: 'p-files' | 'admissions'`; email template accepts `kind: 'renewal' | 'initial-chase'`; `getDocumentChaseQueueCounts(ayCode, module)` per-module bucket gating. P-Files's chase-strip + dashboard prune (KD #71) is the symmetric subtractive half.

### KD #77
Early-bird AY pipeline (migration 038). HFSE accepts applications for the upcoming AY weeks/months before that AY becomes operationally current (e.g. June–November of AY2026 collects AY2027 applications). New `academic_years.accepting_applications` boolean decouples "AY is open for parent-portal submissions" from `is_current` ("school operations target this AY"). Admissions surfaces a dedicated `/admissions/upcoming/applications` route via the sidebar's Pipeline group; it reuses `<StudentDataTable>` scoped to the AY where `accepting_applications=true AND is_current=false`. Empty state when no upcoming AY is open. Main `/admissions` dashboard renders an `<UpcomingAyCard>` top-of-fold (only when current AY is selected + an upcoming AY exists) showing application count + per-stage breakdown + deep-link. AY-Setup wizard step 1 gains a "Open this AY for early-bird applications now" checkbox; the AY-list row carries an `<AyAcceptingApplicationsToggle>` to flip post-creation. New API route `PATCH /api/sis/ay-setup/accepting-applications` audits as `ay.accepting_applications.toggle`. Discount codes (`/sis/admin/discount-codes`) already supported per-AY switching via `listAyCodes` — early-bird codes just go on the upcoming AY. Other modules (Records, P-Files, Markbook, Attendance, Evaluation) stay scoped to current AY only — early-bird applicants live in the upcoming AY's `ay{YYYY}_*` tables and don't leak. Helper: `lib/academic-year.ts::getUpcomingAcademicYear()`.
