-- Migration 0653 built this index concurrently. Attaching it avoids a second uniqueness scan;
-- PostgreSQL still takes a brief ACCESS EXCLUSIVE lock to replace the old primary-key constraint.
ALTER TABLE copyright_legal_hold_restrictions
  DROP CONSTRAINT copyright_legal_hold_restrictions_pkey;

ALTER TABLE copyright_legal_hold_restrictions
  ADD CONSTRAINT copyright_legal_hold_restrictions_pkey
  PRIMARY KEY USING INDEX idx_copyright_legal_hold_restrictions__restriction_assessment;

COMMENT ON TABLE copyright_legal_hold_restrictions IS
  'Typed provenance bindings between restriction records and qualifying legal-hold assessments.';

COMMENT ON COLUMN copyright_legal_hold_restrictions.copyright_restriction_id IS
  'Restriction with immutable provenance from a qualifying legal-hold assessment.';
