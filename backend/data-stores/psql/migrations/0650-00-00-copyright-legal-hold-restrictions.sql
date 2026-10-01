-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_legal_hold_restrictions (
  copyright_restriction_id uuid NOT NULL REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  copyright_notice_legal_hold_assessment_id uuid NOT NULL REFERENCES copyright_notice_legal_hold_assessments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (copyright_restriction_id, copyright_notice_legal_hold_assessment_id),
  UNIQUE (copyright_notice_legal_hold_assessment_id, copyright_restriction_id)
);

COMMENT ON TABLE copyright_legal_hold_restrictions IS 'Typed provenance bindings between restriction records and qualifying legal-hold assessments.';
COMMENT ON COLUMN copyright_legal_hold_restrictions.copyright_restriction_id IS 'Restriction with immutable provenance from a qualifying legal-hold assessment.';
COMMENT ON COLUMN copyright_legal_hold_restrictions.copyright_notice_legal_hold_assessment_id IS 'Legal-hold assessment that established this immutable restriction provenance binding.';
