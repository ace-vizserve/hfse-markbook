<!-- Topic file for `.claude/rules/key-decisions.md`. Numbering is global; do not renumber. -->

## P-Files — documents repository, expiry, renewals, scope

### KD #31
P-Files is a repository, not a review queue. `p-file`+`superadmin` write, `school_admin`+`admin` read. Never sets `'Rejected'` (KD #37). Enrolled-students-only scope enforced by KD #71. `12-p-files-module.md`.

### KD #34
P-Files upload = dual-table write + multi-PDF merge (`pdf-merger-js`) + archive-on-replace snapshot. 10MB/file, 30MB/request. `12-p-files-module.md`.

### KD #36
P-Files revision history is append-only (migration 011). `GET /api/p-files/[enroleeNumber]/revisions`. Hard Rule #6 applies. Captures parent-portal re-uploads via the migration-033 trigger (KD #63).

### KD #60
Document status workflow distinguishes expiring vs non-expiring slots. Non-expiring (idPicture, birthCert, educCert, medical, form12, icaPhoto, financialSupportDocs, vaccinationInformation): `null → 'Uploaded' → 'Valid'` (or `'Rejected'`); registrar manually flips Uploaded→Valid. Expiring (passport, pass, motherPassport, motherPass, fatherPassport, fatherPass, guardianPassport, guardianPass): `null → 'Valid' → 'Expired'` (auto-flip when expiry passes); the expiry date IS the validation evidence, no `'Uploaded'` intermediate. `'To follow'` = parent-acknowledged-pending (either type). `'Rejected'` + `'Expired'` both signal parent re-upload needed. Lifecycle aggregate has separate buckets: "Awaiting document validation" (Uploaded) vs "Awaiting document revalidation" (Rejected + Expired). `DOCUMENT_SLOTS` in `lib/sis/queries.ts` (16 entries; the `expiryCol?:` field is the type discriminator).

### KD #63
Parent-portal re-upload tracking via AFTER UPDATE trigger (migration 033). New `capture_doc_revision()` PL/pgSQL trigger fires AFTER UPDATE OF the 16 slot URL columns on each AY's docs table, gated on enrolled status (KD #31 scope rule). Inserts one `p_file_revisions` row per changed slot; `source` discriminator ∈ `{'pfile-upload', 'parent-portal', 'sis-direct'}` derives from `auth.jwt()` presence. Partial unique index on `(ay_code, enrolee_number, slot_key, previous_url)` lets the route's explicit insert + the trigger's deferred insert dedupe via ON CONFLICT DO NOTHING. `attach_doc_revision_trigger(p_docs_table)` introspects `information_schema.columns` and skips slot URLs that don't exist (handles AY2025 missing the 3 STP columns). Schema: `p_file_revisions.archived_url` + `archived_path` → nullable; new `previous_url` + `source` columns. Metadata-only — file-content preservation out of scope.

### KD #64
P-Files renewal lifecycle (migration 034). Append-only `p_file_outreach` table (`kind ∈ {'reminder', 'promise'}`) backs two registrar actions on actionable `DocumentCard`s: **Notify parent** (`POST /api/p-files/[enroleeNumber]/notify`, Resend per recipient, 24h cooldown) and **Mark as promised by `<date>`** (`PATCH .../promise` flips `<slot>Status='To follow'` per KD #60, surfaces in chase-strip "promised" bucket). Bulk fan-out via `POST /api/p-files/notify/bulk` (cap 50). Recipient resolution by slot prefix: `mother*`/`father*`/`guardian*` → matching email; student slots → mother + father (CC), fallback guardian. Email template at `lib/notifications/email-pfile-reminder.ts` (RESEND_API_KEY no-op fallback per KD #16, dev-redirect per KD #29). Sidebar quicklinks `?expiring=30|60|90` + `?status=expired` flip the `CompletenessTable` into bulk-select mode.

### KD #71
P-Files renewal-only scope guard. Enforces KD #31's enrolled-students-only scope. **Enrollment gate** on `/p-files/[enroleeNumber]` via `lib/p-files/queries.ts::isStudentEnrolled` (whitelist: `applicationStatus IN ('Enrolled', 'Enrolled (Conditional)') AND classSection IS NOT NULL`) — pre-Enrolled applicants 404 instead of leaking through. **Sidebar prune**: only `?status=expired` + `?expiring=30|60|90` quicklinks survive; `?status=missing|uploaded|complete` removed (admissions-territory per KD #70). **Dashboard prune**: drops Pending Review KPI (replaced with Expiring ≤30d), drops `<TopMissingDrillCard>`, simplifies `SlotStatusDrillCard` donut to 2 slices (On file + Expired), removes `pfilesInsights` `pendingReview` branch, replaces "Has Missing" summary card with "Expiring ≤90d". `<DocumentChaseQueueStrip>` mounts with `module="p-files"` so it surfaces only revalidation (Expired) + expiringSoon. Companion: `'to-follow'` promoted to first-class `DocumentStatus` member; `resolveStatus` rewritten so `<slot>Status` column is the single source of truth (null rawStatus → 'missing' regardless of URL).
