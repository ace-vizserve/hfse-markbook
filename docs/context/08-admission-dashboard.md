# Admissions Dashboard

## Overview

The Admissions module of the HFSE SIS — a read-only dashboard that provides decision-making and forecasting support for the admissions team. It does not write to the admissions DB; it reads from the same Supabase admissions tables used by the student roster sync.

This module is scoped to **Phase 2** of development, after the Markbook module (Phase 1) is complete and stable.

---

## Section 1 — Applications Dashboard

### Purpose

Give the admissions team a real-time view of the application pipeline — where applications are stuck, how long they're taking, and what needs attention today.

### 1.1 Pipeline Overview

A summary card row showing counts per `applicationStatus`:

| Card                   | Metric                      |
| ---------------------- | --------------------------- |
| Submitted              | Total applications received |
| Ongoing Verification   | Currently being reviewed    |
| Processing             | In active processing        |
| Enrolled               | Successfully enrolled       |
| Enrolled (Conditional) | Conditionally enrolled      |
| Withdrawn              | Withdrawn after submission  |
| Cancelled              | Cancelled applications      |

### 1.2 Outdated Applications

Applications that have not been updated within a configurable threshold (default: 7 days).

**Logic:**

```sql
SELECT
  s."enroleeNumber",
  s."enroleeName",
  s."applicationStatus",
  s."applicationUpdatedDate",
  CURRENT_DATE - s."applicationUpdatedDate" AS days_since_update,
  s."levelApplied",
  s."classSection"
FROM public.ay2026_enrolment_status s
WHERE s."applicationStatus" NOT IN ('Enrolled', 'Cancelled', 'Withdrawn')
  AND (
    s."applicationUpdatedDate" < CURRENT_DATE - INTERVAL '7 days'
    OR s."applicationUpdatedDate" IS NULL
  )
ORDER BY days_since_update DESC NULLS FIRST;
```

Display as a sortable table with a red/amber/green indicator:

- 🔴 Red: No update in 14+ days
- 🟡 Amber: No update in 7–13 days
- 🟢 Green: Updated within 7 days

### 1.3 Day Counter Per Application

For each application, show the number of days elapsed from `created_at` to reaching "Enrolled" status (or current date if not yet enrolled).

**Logic:**

```sql
SELECT
  a."enroleeNumber",
  a."enroleeFullName",
  a."levelApplied",
  s."applicationStatus",
  a.created_at::date AS application_date,
  CASE
    WHEN s."applicationStatus" IN ('Enrolled', 'Enrolled (Conditional)')
    THEN s."applicationUpdatedDate" - a.created_at::date
    ELSE CURRENT_DATE - a.created_at::date
  END AS days_in_pipeline,
  CASE
    WHEN s."applicationStatus" IN ('Enrolled', 'Enrolled (Conditional)')
    THEN 'completed'
    ELSE 'in_progress'
  END AS pipeline_state
FROM public.ay2026_enrolment_applications a
JOIN public.ay2026_enrolment_status s
  ON a."enroleeNumber" = s."enroleeNumber"
ORDER BY days_in_pipeline DESC;
```

Display as a ranked list — longest-running open applications at the top. This highlights which applicants have been waiting the longest without resolution.

### 1.4 Average Time to Enrollment

A summary metric:

```sql
SELECT
  ROUND(AVG(
    s."applicationUpdatedDate" - a.created_at::date
  ), 1) AS avg_days_to_enrollment
FROM public.ay2026_enrolment_applications a
JOIN public.ay2026_enrolment_status s
  ON a."enroleeNumber" = s."enroleeNumber"
WHERE s."applicationStatus" IN ('Enrolled', 'Enrolled (Conditional)');
```

### 1.5 Applications by Level

Bar chart showing application counts per `levelApplied`:

- Submitted vs Enrolled comparison per level
- Helps forecast class sizes and identify under/over-subscribed levels

### 1.6 Conversion Funnel

A funnel visualization showing drop-off between stages:

```
Submitted → Ongoing Verification → Processing → Enrolled
```

Shows both count and percentage at each stage.

---

## Section 2 — Inquiry Tracking

### Purpose

Track prospective student inquiries alongside the application pipeline. Provides visibility into whether the inquiry list is being maintained and how well inquiries convert to applications.

### 2.1 M365 Connector Integration

**Confirmed:** Inquiry data is stored in a **SharePoint List**. The dashboard reads from it via the Microsoft Graph API.

**API endpoint:**

```
GET https://graph.microsoft.com/v1.0/sites/{site-id}/lists/{list-id}/items?expand=fields
```

**Required M365 app registration (Azure AD):**

- Application (client credentials) flow — server-side only, no user login required
- Permission: `Sites.Read.All` (application permission)
- Tenant ID, Client ID, and Client Secret stored as environment variables

**Environment variables to add:**

```bash
M365_TENANT_ID=
M365_CLIENT_ID=
M365_CLIENT_SECRET=
SHAREPOINT_SITE_ID=        # from Graph API: /sites/{hostname}:/{site-path}
SHAREPOINT_LIST_ID=        # from Graph API: /sites/{site-id}/lists
```

**Token acquisition (server-side, Next.js API route):**

```typescript
const tokenRes = await fetch(`https://login.microsoftonline.com/${process.env.M365_TENANT_ID}/oauth2/v2.0/token`, {
  method: "POST",
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.M365_CLIENT_ID!,
    client_secret: process.env.M365_CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
  }),
});
const { access_token } = await tokenRes.json();
```

**Fetching SharePoint list items:**

```typescript
const res = await fetch(
  `https://graph.microsoft.com/v1.0/sites/${process.env.SHAREPOINT_SITE_ID}/lists/${process.env.SHAREPOINT_LIST_ID}/items?expand=fields&$top=999`,
  { headers: { Authorization: `Bearer ${access_token}` } },
);
const { value: items } = await res.json();
```

**What to confirm with HFSE before building:**

1. The SharePoint site URL and list name (to get the site ID and list ID via Graph Explorer)
2. Whether an Azure AD app registration already exists, or if one needs to be created
3. The exact column names in the SharePoint list (inquiry date, name, level, source, status, etc.)

**Required M365 permissions:**

- `Sites.Read.All` (application permission — does not require user login)

### 2.2 Inquiry Dashboard View

| Metric                       | Description                                             |
| ---------------------------- | ------------------------------------------------------- |
| Total inquiries (current AY) | Count of all logged inquiries                           |
| Converted to application     | Count where an application exists for the same contact  |
| Conversion rate              | % of inquiries that became applications                 |
| Last updated                 | Timestamp of most recent inquiry record                 |
| Stale flag                   | Alert if no new inquiry logged in X days (configurable) |

### 2.3 Inquiry Staleness Alert

If the inquiry list has not been updated within a configurable threshold (default: 3 days on school days), display a prominent warning:

> ⚠️ Inquiry list has not been updated in 5 days. Last update: [date].

This keeps the admissions team accountable for maintaining the inquiry log.

### 2.4 Inquiry-to-Application Matching

Match inquiries to applications by email or name to show conversion:

```
Inquiry received → Application submitted → Enrolled
```

Display unmatched inquiries separately — these are leads that never converted to an application.

---

## Suggested Additional Visualizations

### For Applications

| Visualization                       | Value                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| **Weekly application volume trend** | Line chart — are applications accelerating or slowing?                              |
| **Status breakdown by level**       | Heatmap — which levels have bottlenecks?                                            |
| **Document completion rate**        | % of applicants with all required docs submitted (from `enrolment_documents`)       |
| **Assessment outcomes**             | Pass/fail rate from `assessmentGradeMath` + `assessmentGradeEnglish`                |
| **Nationality breakdown**           | Pie chart for diversity/visa planning                                               |
| **Referral source**                 | Bar chart from `howDidYouKnowAboutHFSEIS` — which channels drive most applications? |

### For Inquiries

| Visualization                      | Value                                                         |
| ---------------------------------- | ------------------------------------------------------------- |
| **Inquiry source breakdown**       | Where are inquiries coming from (walk-in, website, referral)? |
| **Inquiry-to-enrollment timeline** | Average days from first inquiry to enrolled status            |
| **Weekly inquiry trend**           | Are inquiry volumes up or down vs same period last AY?        |

---

## Access Control

| Role         | Access                                          |
| ------------ | ----------------------------------------------- |
| `registrar`  | View only — applications relevant to their work |
| `admin`      | Full dashboard access                           |
| `superadmin` | Full access including data export               |
| `teacher`    | No access                                       |

---

## Technical Notes

### AY Table Switching

Like the student roster sync, this dashboard queries year-specific tables (`ay2026_*`, `ay2027_*`). The AY prefix must be configurable — do not hardcode the year.

### Read-Only

This module never writes to the admissions DB. All queries are `SELECT` only. Use the `ADMISSIONS_SUPABASE_SERVICE_KEY` with a read-only Postgres role if possible.

### Caching

Application counts and funnel metrics do not need to be real-time. Cache dashboard queries for 5–15 minutes to avoid hammering the admissions DB on every page load. Use Next.js `fetch` cache or a simple in-memory cache.

### M365 Integration Dependency

Inquiry data source is **confirmed: SharePoint List**.

Still needed before building:

1. SharePoint site URL and list name — to retrieve site ID and list ID via Graph Explorer
2. Azure AD app registration — confirm if one exists or needs to be created
3. Tenant ID, Client ID, Client Secret — from whoever manages HFSE's Azure AD tenant
4. Exact column names in the SharePoint inquiry list

The applications dashboard (Section 1) can be built independently — it has no M365 dependency.

---

## Sprint Placement

This entire module is **Phase 2 / Sprint 7** — after the 6 core grading sprints are complete.

Sprint 7 tasks:

- [ ] Applications pipeline overview cards
- [ ] Outdated applications table with staleness indicators
- [ ] Day counter per application
- [ ] Average time to enrollment metric
- [ ] Applications by level bar chart
- [ ] Conversion funnel visualization
- [ ] M365 connector research and setup (blocked on HFSE confirmation)
- [ ] Inquiry dashboard view (after M365 setup)
- [ ] Inquiry staleness alert
