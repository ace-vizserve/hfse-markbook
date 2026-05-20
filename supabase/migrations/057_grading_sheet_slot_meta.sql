-- 057_grading_sheet_slot_meta.sql
--
-- Extends slot_labels jsonb to add date_administered (ISO date) and optional
-- page/reference per WW/PT slot. Mirrors HFSE's existing workbook pattern:
--
--   Component | Description | Page # | Date Administered
--
-- New ww/pt entry shape: { "label": "...", "date": "yyyy-MM-dd", "page": "..." }
-- Null entries remain null (unused slot). QA stays a plain string.
--
-- Data migration: coerce any existing string values in ww/pt arrays to the
-- new object shape. "Pangngalan" → {"label": "Pangngalan", "date": null, "page": null}.
-- Null array elements, the qa key, and already-object entries are preserved.
--
-- Gate rule (enforced in the UI):
--   A slot unlocks for score entry only when BOTH label AND date are set.
--   Slots with only a label are "planned but not yet administered" — score cells
--   stay disabled until the teacher fills the date. Page is optional, never gates.

update public.grading_sheets
set slot_labels = slot_labels
  || case
       when jsonb_typeof(slot_labels->'ww') = 'array' then
         jsonb_build_object('ww', (
           select jsonb_agg(
             case
               when jsonb_typeof(entry) = 'string' then
                 jsonb_build_object('label', entry, 'date', null::text, 'page', null::text)
               else entry
             end
           )
           from jsonb_array_elements(slot_labels->'ww') as entry
         ))
       else '{}'::jsonb
     end
  || case
       when jsonb_typeof(slot_labels->'pt') = 'array' then
         jsonb_build_object('pt', (
           select jsonb_agg(
             case
               when jsonb_typeof(entry) = 'string' then
                 jsonb_build_object('label', entry, 'date', null::text, 'page', null::text)
               else entry
             end
           )
           from jsonb_array_elements(slot_labels->'pt') as entry
         ))
       else '{}'::jsonb
     end
where slot_labels is not null;

comment on column public.grading_sheets.slot_labels is
  'Teacher-authored activity metadata per score slot. '
  'Shape: {"ww": [{"label": string|null, "date": "yyyy-MM-dd"|null, "page": string|null}|null, ...], "pt": [...], "qa": string|null}. '
  'ww/pt entries are SlotMeta objects (or null for unused slots). '
  'qa is still a plain string. Not subject to lock enforcement.';
