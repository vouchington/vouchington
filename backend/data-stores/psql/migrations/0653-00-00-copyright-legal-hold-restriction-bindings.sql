-- migration-mode: online

-- The follow-up fixed migration attaches this index as the composite primary key. Building it
-- concurrently keeps writes flowing while PostgreSQL verifies uniqueness on existing bindings.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_copyright_legal_hold_restrictions__restriction_assessment
  ON copyright_legal_hold_restrictions (
    copyright_restriction_id,
    copyright_notice_legal_hold_assessment_id
  );
