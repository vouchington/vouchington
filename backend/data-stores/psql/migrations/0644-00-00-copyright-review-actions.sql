-- A restriction is target-scoped, so narrowing is represented by confirming some targets and
-- reversing others. A per-target "modify" result had no distinct effect and is not a valid state.

ALTER TABLE copyright_restrictions
  DROP CONSTRAINT copyright_restrictions_human_review_action_check;
ALTER TABLE copyright_restrictions
  ADD CONSTRAINT copyright_restrictions_human_review_action_check
  CHECK (human_review_action IN ('confirm', 'reverse')) NOT VALID;
ALTER TABLE copyright_restrictions
  VALIDATE CONSTRAINT copyright_restrictions_human_review_action_check;

ALTER TABLE copyright_notice_appeal_reviews
  DROP CONSTRAINT copyright_notice_appeal_reviews_action_check;
ALTER TABLE copyright_notice_appeal_reviews
  ADD CONSTRAINT copyright_notice_appeal_reviews_action_check
  CHECK (action IN ('confirm', 'reverse')) NOT VALID;
ALTER TABLE copyright_notice_appeal_reviews
  VALIDATE CONSTRAINT copyright_notice_appeal_reviews_action_check;

COMMENT ON COLUMN copyright_restrictions.human_review_action IS
  'Human outcome for this target restriction: confirm or reverse.';
