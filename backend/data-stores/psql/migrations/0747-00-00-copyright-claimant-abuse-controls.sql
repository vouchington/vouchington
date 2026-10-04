-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Claimant misuse ledger (DSA Art. 23, 17 U.S.C. 512(f) evidence), the sticky refusals that keep a
-- gated notice with a moderator, and the marker for restrictions lifted because their claimant was
-- suspended. No table here suspends anyone.

CREATE TABLE copyright_claimant_misuse_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN (
    'notice_withdrawn',
    'notice_rejected',
    'restriction_reversed_by_counter_notice',
    'restriction_reversed_by_appeal'
  )),
  copyright_notice_submission_id uuid UNIQUE REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_notice_submission_assessment_id uuid UNIQUE REFERENCES copyright_notice_submission_assessments(id) ON DELETE RESTRICT,
  copyright_restriction_id uuid UNIQUE REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT copyright_claimant_misuse_event_shape CHECK (
    (outcome = 'notice_withdrawn'
      AND copyright_notice_submission_id IS NOT NULL
      AND copyright_notice_submission_assessment_id IS NULL
      AND copyright_restriction_id IS NULL)
    OR (outcome = 'notice_rejected'
      AND copyright_notice_submission_id IS NULL
      AND copyright_notice_submission_assessment_id IS NOT NULL
      AND copyright_restriction_id IS NULL)
    OR (outcome IN ('restriction_reversed_by_counter_notice', 'restriction_reversed_by_appeal')
      AND copyright_notice_submission_id IS NULL
      AND copyright_notice_submission_assessment_id IS NULL
      AND copyright_restriction_id IS NOT NULL)
  )
);

CREATE INDEX idx_copyright_claimant_misuse_events__notice
  ON copyright_claimant_misuse_events (copyright_notice_id, id DESC);

CREATE TABLE copyright_automatic_withholding_refusals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL UNIQUE REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN (
    'thresholds_unset',
    'switch_on_unrecorded',
    'received_before_switch_on',
    'claimant_unavailable',
    'claimant_suspended',
    'trust_below_minimum',
    'account_too_new',
    'claimant_daily_cap',
    'poster_daily_cap'
  )),
  refused_at timestamptz NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_claimant_suspension_reversals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_restriction_id uuid NOT NULL UNIQUE REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  reversed_at timestamptz NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trigger_copyright_claimant_misuse_events_immutable
  BEFORE UPDATE OR DELETE ON copyright_claimant_misuse_events
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

CREATE TRIGGER trigger_copyright_automatic_withholding_refusals_immutable
  BEFORE UPDATE OR DELETE ON copyright_automatic_withholding_refusals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

CREATE TRIGGER trigger_copyright_claimant_suspension_reversals_immutable
  BEFORE UPDATE OR DELETE ON copyright_claimant_suspension_reversals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

COMMENT ON TABLE copyright_claimant_misuse_events IS 'Append-only ledger of claimant misuse evidence: a notice withdrawn, a notice rejected on staff review, or a restriction reversed by counter-notice restoration or appeal. Recorded whatever the automatic-withholding switch says. The claimant is the notice''s claimant_user_id, so erasing that account erases the link and nothing here suspends anyone.';
COMMENT ON COLUMN copyright_claimant_misuse_events.copyright_notice_id IS 'Notice this event is evidence about.';
COMMENT ON COLUMN copyright_claimant_misuse_events.outcome IS 'What happened to the notice or its restriction. Suspension lifts and moderator reversals of a suspended claimant''s withholding are not misuse and are never recorded.';
COMMENT ON COLUMN copyright_claimant_misuse_events.copyright_notice_submission_id IS 'Withdrawal submission. Set only for notice_withdrawn, and at most one event per submission.';
COMMENT ON COLUMN copyright_claimant_misuse_events.copyright_notice_submission_assessment_id IS 'Staff assessment that found the notice not substantially compliant. Set only for notice_rejected, and at most one event per assessment.';
COMMENT ON COLUMN copyright_claimant_misuse_events.copyright_restriction_id IS 'Restriction a counter-notice restoration or appeal reversed. Set only for the two reversal outcomes, and at most one event per restriction.';
COMMENT ON COLUMN copyright_claimant_misuse_events.recorded_at IS 'Time the decision that created this evidence was made.';
COMMENT ON TABLE copyright_automatic_withholding_refusals IS 'Sticky record that a signed-in notice failed an automatic-withholding gate, so only a moderator may withhold it. Written once per submission, never retried when a cap later clears, and never dropped: the notice stays in the staff queue.';
COMMENT ON COLUMN copyright_automatic_withholding_refusals.copyright_notice_submission_id IS 'Notice submission whose automated assessment was refused. One refusal per submission.';
COMMENT ON COLUMN copyright_automatic_withholding_refusals.reason IS 'First gate the submission failed: unset thresholds, an unrecorded or later switch-on, an erased or suspended claimant, trust or account age below the minimum, or a claimant or poster daily cap.';
COMMENT ON COLUMN copyright_automatic_withholding_refusals.refused_at IS 'Time the gate refused automatic withholding.';
COMMENT ON TABLE copyright_claimant_suspension_reversals IS 'Marks a restriction that was reversed through the ordinary reversal path because its claimant was suspended, so staff can tell it from a moderator''s review of the notice. The reviewer on the restriction is the administrator who suspended the claimant. Never evidence of misuse.';
COMMENT ON COLUMN copyright_claimant_suspension_reversals.copyright_restriction_id IS 'Automatic restriction that was reversed. At most one marker per restriction.';
COMMENT ON COLUMN copyright_claimant_suspension_reversals.reversed_at IS 'Time the reversal was decided; the restore delivery that lifts the restriction follows.';
