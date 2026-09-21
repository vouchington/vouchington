ALTER TABLE copyright_legal_hold_restrictions
  DROP CONSTRAINT IF EXISTS copyright_legal_hold_restrictions_pkey;

ALTER TABLE copyright_legal_hold_restrictions
  ADD CONSTRAINT copyright_legal_hold_restrictions_pkey
  PRIMARY KEY (copyright_restriction_id, copyright_notice_legal_hold_assessment_id);

COMMENT ON TABLE copyright_legal_hold_restrictions IS
  'Typed provenance bindings between restriction records and qualifying legal-hold assessments.';

COMMENT ON COLUMN copyright_legal_hold_restrictions.copyright_restriction_id IS
  'Restriction with immutable provenance from a qualifying legal-hold assessment.';
