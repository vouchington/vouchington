-- One operative incident per account per confirmed copyright notice.
-- Restoration does not clear it. A second operative incident opens a staff review
-- and does not suspend or delete the account.

CREATE TABLE copyright_repeat_infringer_incidents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  account_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  operative boolean NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_user_id, copyright_notice_id)
);

CREATE INDEX idx_copyright_repeat_infringer_incidents__operative_account
  ON copyright_repeat_infringer_incidents (account_user_id)
  WHERE operative;

CREATE TABLE copyright_repeat_infringer_dispositions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_repeat_infringer_incident_id uuid NOT NULL UNIQUE REFERENCES copyright_repeat_infringer_incidents(id) ON DELETE RESTRICT,
  disposition text NOT NULL CHECK (disposition IN ('withdrawn', 'duplicate', 'abusive')),
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  recorded_at timestamptz NOT NULL,
  recorded_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_repeat_infringer_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  account_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL,
  outcome text CHECK (outcome IN ('warning', 'no_action', 'restrict', 'terminate', 'reinstatement')),
  outcome_at timestamptz,
  outcome_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  rationale_ciphertext text CHECK (
    rationale_ciphertext IS NULL OR char_length(rationale_ciphertext) BETWEEN 1 AND 65536
  ),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((outcome IS NULL) = (outcome_at IS NULL)),
  CHECK ((outcome IS NULL) = (rationale_ciphertext IS NULL))
);

CREATE UNIQUE INDEX idx_copyright_repeat_infringer_reviews__one_open
  ON copyright_repeat_infringer_reviews (account_user_id)
  WHERE outcome IS NULL;

CREATE FUNCTION fn_guard_copyright_repeat_infringer_incident()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright repeat-infringer incidents are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.account_user_id IS DISTINCT FROM OLD.account_user_id
    OR NEW.copyright_notice_id IS DISTINCT FROM OLD.copyright_notice_id THEN
    RAISE EXCEPTION 'copyright repeat-infringer incident identity is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION fn_guard_copyright_repeat_infringer_review()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright repeat-infringer reviews are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.account_user_id IS DISTINCT FROM OLD.account_user_id
    OR NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
    RAISE EXCEPTION 'copyright repeat-infringer review identity is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.outcome IS NOT NULL AND (
    NEW.outcome IS DISTINCT FROM OLD.outcome
    OR NEW.outcome_at IS DISTINCT FROM OLD.outcome_at
    OR NEW.rationale_ciphertext IS DISTINCT FROM OLD.rationale_ciphertext
    OR (
      OLD.outcome_by_id IS DISTINCT FROM NEW.outcome_by_id
      AND NEW.outcome_by_id IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'copyright repeat-infringer review outcome is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_repeat_infringer_incidents_guard
  BEFORE UPDATE OR DELETE ON copyright_repeat_infringer_incidents
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_repeat_infringer_incident();

CREATE TRIGGER trigger_copyright_repeat_infringer_dispositions_immutable
  BEFORE UPDATE OR DELETE ON copyright_repeat_infringer_dispositions
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('recorded_by_id');

CREATE TRIGGER trigger_copyright_repeat_infringer_dispositions_actor
  BEFORE INSERT ON copyright_repeat_infringer_dispositions
  FOR EACH ROW EXECUTE FUNCTION fn_require_copyright_human_actor('recorded_by_id');

CREATE TRIGGER trigger_copyright_repeat_infringer_reviews_guard
  BEFORE UPDATE OR DELETE ON copyright_repeat_infringer_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_repeat_infringer_review();

COMMENT ON TABLE copyright_repeat_infringer_incidents IS 'One account incident per copyright notice. Operative means a human confirm or modify still stands and no withdrawal, duplicate, or abusive disposition exists.';
COMMENT ON COLUMN copyright_repeat_infringer_incidents.account_user_id IS 'Post author who owned the confirmed placement. Guest placements do not create an incident.';
COMMENT ON COLUMN copyright_repeat_infringer_incidents.copyright_notice_id IS 'Copyright notice this incident belongs to. Several targets on one notice are still one incident.';
COMMENT ON COLUMN copyright_repeat_infringer_incidents.operative IS 'Whether this notice still counts toward the repeat-infringer review threshold.';
COMMENT ON TABLE copyright_repeat_infringer_dispositions IS 'Staff decision that a confirmed incident no longer counts: withdrawn, duplicate, or abusive.';
COMMENT ON COLUMN copyright_repeat_infringer_dispositions.disposition IS 'Why the incident stopped counting. Restoration is not a disposition.';
COMMENT ON COLUMN copyright_repeat_infringer_dispositions.rationale_ciphertext IS 'Encrypted staff rationale for removing the incident.';
COMMENT ON TABLE copyright_repeat_infringer_reviews IS 'Required staff review opened when an account reaches two operative incidents. Opening a review does not suspend the account.';
COMMENT ON COLUMN copyright_repeat_infringer_reviews.outcome IS 'Staff outcome. Null while the review is open. Restrict and terminate are applied by a later administrator action.';
COMMENT ON COLUMN copyright_repeat_infringer_reviews.rationale_ciphertext IS 'Encrypted staff rationale recorded with the outcome.';
