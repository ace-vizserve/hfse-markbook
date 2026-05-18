-- Letterhead / report-card-header fields. Replaces the static raster at
-- public/report-card/report-card-header.png — values now flow from this
-- singleton row into <ReportCardLetterhead /> at render time. Defaults
-- below seed HFSE's current letterhead so the migration is non-breaking
-- on the existing prod row (id=1 from migration 022). The existing
-- pei_registration_number column stays untouched; only its form placement
-- moves to the new Letterhead section in the school-config UI.

ALTER TABLE school_config
  ADD COLUMN organization_name              text NOT NULL DEFAULT '',
  ADD COLUMN address_line_1                 text NOT NULL DEFAULT '',
  ADD COLUMN address_line_2                 text NOT NULL DEFAULT '',
  ADD COLUMN phone_number                   text NOT NULL DEFAULT '',
  ADD COLUMN website_url                    text NOT NULL DEFAULT '',
  ADD COLUMN contact_email                  text NOT NULL DEFAULT '',
  ADD COLUMN pei_registration_start_date    date NULL,
  ADD COLUMN pei_registration_end_date      date NULL,
  ADD COLUMN logo_url                       text NOT NULL DEFAULT '';

-- Seed HFSE's current letterhead values onto the singleton row so the
-- printed report-card render after deploy matches what the PNG carries
-- today. Admins can edit any of these from /sis/admin/school-config.
UPDATE school_config
SET organization_name           = 'HFSE Global Education Group',
    address_line_1              = '223 Mountbatten Road, #01-08, 223@Mountbatten',
    address_line_2              = 'Singapore 398008',
    phone_number                = '+65 6451 0080',
    website_url                 = 'https://hfse.edu.sg',
    contact_email               = 'enquiry@hfse.edu.sg',
    pei_registration_start_date = DATE '2025-03-26',
    pei_registration_end_date   = DATE '2029-03-25'
WHERE id = 1;

-- Cross-column sanity: if both dates are set, start must precede end.
ALTER TABLE school_config
  ADD CONSTRAINT school_config_pei_period_order_chk
  CHECK (
    pei_registration_start_date IS NULL
    OR pei_registration_end_date IS NULL
    OR pei_registration_start_date <= pei_registration_end_date
  );

COMMENT ON COLUMN school_config.organization_name           IS 'Legal organisation name shown on the report-card letterhead.';
COMMENT ON COLUMN school_config.address_line_1              IS 'Street address line 1 for the letterhead.';
COMMENT ON COLUMN school_config.address_line_2              IS 'Street address line 2 (city, postal) for the letterhead.';
COMMENT ON COLUMN school_config.phone_number                IS 'Public phone number shown on the letterhead contact line.';
COMMENT ON COLUMN school_config.website_url                 IS 'Public website URL shown on the letterhead contact line.';
COMMENT ON COLUMN school_config.contact_email               IS 'Public enquiry email shown on the letterhead contact line.';
COMMENT ON COLUMN school_config.pei_registration_start_date IS 'Start of the current PEI registration period (ICA/ECRA).';
COMMENT ON COLUMN school_config.pei_registration_end_date   IS 'End of the current PEI registration period.';
COMMENT ON COLUMN school_config.logo_url                    IS 'Public URL of the school logo shown on the letterhead. Blank = bundled /hfse-logo.webp fallback.';
