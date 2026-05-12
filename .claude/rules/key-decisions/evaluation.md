<!-- Topic file for `.claude/rules/key-decisions.md`. Numbering is global; do not renumber. -->

## Evaluation — form-class-adviser writeups

### KD #49
Evaluation module owns the form-class-adviser write-up — sole source for T1–T3 report card FCA comments. `evaluation_writeups` is the source of truth, read by `lib/report-card/build-report-card.ts`. `terms.virtue_theme` drives the parenthetical: "Form Class Adviser's Comments (HFSE Virtues: …)". `/markbook/sections/[id]/comments` + `/markbook/grading/advisory/[id]/comments` redirect to Evaluation. T4 excluded (no FCA comment on the final card). `report_card_comments` is legacy (migration 018 backfilled into `evaluation_writeups`).
