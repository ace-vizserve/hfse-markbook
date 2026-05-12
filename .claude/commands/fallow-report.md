## Fallow Code Quality Report

Run a full fallow scan, synthesize the raw output into a polished, decision-ready code quality report, save the markdown, and render a 1920×1080 dashboard PNG. Do not dump the raw fallow output to the user — only the synthesized report.

### 1. Run the scan

Execute:

```
npx fallow --explain
```

Capture the full output. The combined run covers dead code, duplication, and complexity. `--explain` adds metric definitions and ranges. Exit code 1 is expected when issues are found — keep parsing the output, do not abort.

If the command fails to execute at all (binary missing, parse error), STOP and report the error verbatim.

### 2. Produce the report

Write a markdown report with the structure below. Cite every finding with `file:line`. Never invent numbers, never hedge, never pad empty sections.

#### Executive Summary

3–5 lines. Lead with: health grade/score, maintainability index, total LOC, dead-code %, duplication %, and the single most important takeaway. End with the trend direction if hotspots data shows it.

#### Headline Metrics

| Metric | Value | Status |
| ------ | ----- | ------ |

Status uses one of: `OK`, `Watch`, `Critical`. Cover at minimum:

- Maintainability index
- Dead files % and count
- Dead exports % and count
- Duplication % and lines
- Functions above complexity threshold
- Churn × complexity hotspots

#### Dead Code

Three subsections — unused files, unused exports, unused type exports. List every entry with `file:line`. If a subsection is empty, write `None.` and move on.

#### Duplication

For each clone group: both locations with line ranges, total duplicated lines, and a one-sentence recommendation naming the shared abstraction (function, hook, type, component) that could absorb it. If duplication % is below 1%, lead with that fact and only list groups ≥ 10 lines.

#### Complexity Hotspots

Top 10 functions by CRAP score. Table columns: function — `file:line` — cyclomatic / cognitive / LOC — CRAP — severity tier (`CRITICAL` / `HIGH` / `MEDIUM`).

#### Large Functions

Any function exceeding 60 LOC. Same table format as above, sorted by LOC descending.

#### Churn × Complexity Hotspots

Files where high churn meets high complexity — these are the maintenance-risk files. Columns: file — commits — churn — density — fan-in — trend (`stable` / `cooling` / `accelerating`).

#### Refactoring Targets

Reproduce fallow's prioritized refactoring targets verbatim, then for each one add: (a) a concrete suggested action in plain language, (b) effort (low/medium/high), (c) ROI rationale.

#### Prioritized Action Plan

A numbered punch list ordered by ROI:

1. Quick wins first (effort: low, impact: clear).
2. Medium-effort cleanups next.
3. Larger initiatives last (multi-file refactors, breaking up god components).

Each item: file path, one-line "why this matters," and any blocking risk (e.g. "needs manual form testing").

End the report body with one line: `Run with: npx fallow --explain` so the reader can reproduce.

### 3. Save the markdown report

Compute a single timestamp `STAMP` in the format `YYYYMMDD-HHMMSS` using local time. Use the SAME stamp for both the markdown and the image so the pair stays linked.

Write the synthesized report to `reports/fallow/fallow-report-<STAMP>.md`.

- Create the `reports/fallow/` directory if it doesn't exist.
- Each run produces a new timestamped file — never overwrite a previous report.
- Prepend the file with a frontmatter block:

  ```
  ---
  generated: <ISO-8601 timestamp>
  command: npx fallow --explain
  image: fallow-report-<STAMP>.png
  ---
  ```

- The directory `reports/fallow/` is gitignored — these are local artifacts, not committed.

### 4. Render the dashboard image

Run:

```
node scripts/fallow-report-image.mjs --out reports/fallow/fallow-report-<STAMP>.png
```

The script runs `npx fallow --format json` internally and renders a 1920×1080 PNG dashboard (executive summary, headline metrics, top complexity hotspots, action plan). The script prints the output path on success.

If the script fails (missing fonts, missing deps), report the error and continue — the markdown report is still useful on its own.

### 5. Output to chat

After saving, output to the user:

1. The full synthesized report (same content as the saved markdown, minus the frontmatter).
2. Two final lines:
   - `Saved markdown: reports/fallow/fallow-report-<STAMP>.md`
   - `Saved image: reports/fallow/fallow-report-<STAMP>.png`

### Rules

- Don't include the raw fallow output in the response — only the synthesized report.
- If a section has zero findings, write `None.` — don't pad with disclaimers.
- Don't suggest fixes the fallow output can't justify.
- Use only `OK` / `Watch` / `Critical` for status — no other emoji or labels.
- Round percentages to 1 decimal place; round CRAP scores to integers.
- The markdown stamp and image stamp must match (single STAMP variable computed once at the start).
