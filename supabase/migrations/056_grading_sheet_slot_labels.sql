-- 056_grading_sheet_slot_labels.sql
--
-- Adds slot_labels jsonb to grading_sheets so teachers can annotate each
-- WW / PT / QA column with a short activity description
-- (e.g. "WW1 → Group Report", "PT2 → Performance Play").
--
-- Shape: { "ww": ["label", null, ...], "pt": ["label", ...], "qa": "label" }
-- Null entries = no label for that slot. Labels are display-only metadata;
-- they are not subject to Hard Rule #5 (locking) and can be edited freely.

alter table public.grading_sheets
  add column if not exists slot_labels jsonb null;

comment on column public.grading_sheets.slot_labels is
  'Teacher-authored activity labels per score slot. '
  'Shape: {"ww": ["label"|null, ...], "pt": ["label"|null, ...], "qa": "label"|null}. '
  'Null values mean no label for that slot. Not subject to lock enforcement.';
