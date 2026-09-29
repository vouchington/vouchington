-- Staff alerts are derived from case, deadline, and delivery rows. Approval is a retained
-- policy row: there is no review-age threshold and no notification destination.

CREATE TABLE IF NOT EXISTS copyright_staff_alert_policies (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  approved_at timestamptz NOT NULL,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_erased_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (revoked_at IS NULL OR revoked_at >= approved_at),
  CHECK (approved_by_user_erased_at IS NULL OR approved_by_user_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_copyright_staff_alert_policies__one_active
  ON copyright_staff_alert_policies ((true))
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_staff_alert_policies__approved_by
  ON copyright_staff_alert_policies (approved_by_user_id)
  WHERE approved_by_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS copyright_staff_alerts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_deadline_id uuid REFERENCES copyright_notice_deadlines(id) ON DELETE RESTRICT,
  copyright_notice_delivery_intent_id uuid REFERENCES copyright_notice_delivery_intents(id) ON DELETE RESTRICT,
  condition text NOT NULL CHECK (condition IN (
    'awaiting_review',
    'urgent_filing',
    'missed_deadline',
    'delivery_failed',
    'delivery_bounced',
    'reconciliation_needed'
  )),
  condition_opened_at timestamptz NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT copyright_staff_alerts_source_check CHECK (
    (
      condition IN ('awaiting_review', 'urgent_filing')
      AND copyright_notice_deadline_id IS NULL
      AND copyright_notice_delivery_intent_id IS NULL
    ) OR (
      condition = 'missed_deadline'
      AND copyright_notice_deadline_id IS NOT NULL
      AND copyright_notice_delivery_intent_id IS NULL
    ) OR (
      condition IN ('delivery_failed', 'delivery_bounced', 'reconciliation_needed')
      AND copyright_notice_delivery_intent_id IS NOT NULL
      AND copyright_notice_deadline_id IS NULL
    )
  ),
  CONSTRAINT copyright_staff_alerts_resolved_after_open CHECK (
    resolved_at IS NULL OR resolved_at >= condition_opened_at
  )
);

CREATE INDEX IF NOT EXISTS idx_copyright_staff_alerts__notice
  ON copyright_staff_alerts (copyright_notice_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_copyright_staff_alerts__case_condition
  ON copyright_staff_alerts (copyright_notice_id, condition)
  WHERE copyright_notice_deadline_id IS NULL AND copyright_notice_delivery_intent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_copyright_staff_alerts__deadline_condition
  ON copyright_staff_alerts (copyright_notice_deadline_id, condition)
  WHERE copyright_notice_deadline_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_copyright_staff_alerts__delivery_condition
  ON copyright_staff_alerts (copyright_notice_delivery_intent_id, condition)
  WHERE copyright_notice_delivery_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS copyright_staff_alert_acknowledgements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_staff_alert_id uuid NOT NULL REFERENCES copyright_staff_alerts(id) ON DELETE RESTRICT,
  acknowledged_at timestamptz NOT NULL,
  acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_by_user_erased_at timestamptz,
  condition_opened_at timestamptz NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (acknowledged_by_user_erased_at IS NULL OR acknowledged_by_user_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_copyright_staff_alert_acks__episode
  ON copyright_staff_alert_acknowledgements (copyright_staff_alert_id, condition_opened_at);
CREATE INDEX IF NOT EXISTS idx_copyright_staff_alert_acks__actor
  ON copyright_staff_alert_acknowledgements (acknowledged_by_user_id)
  WHERE acknowledged_by_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_guard_copyright_staff_alert_policy()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright staff alert policies are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approved_at IS DISTINCT FROM NEW.approved_at THEN
    RAISE EXCEPTION 'copyright staff alert policy approval is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND OLD.revoked_at IS DISTINCT FROM NEW.revoked_at THEN
    RAISE EXCEPTION 'copyright staff alert policy revocation is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approved_by_user_id IS DISTINCT FROM NEW.approved_by_user_id THEN
    IF OLD.approved_by_user_id IS NULL OR NEW.approved_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'copyright staff alert policy approver cannot change' USING ERRCODE = 'check_violation';
    END IF;
    NEW.approved_by_user_erased_at := CURRENT_TIMESTAMP;
  ELSIF NEW.approved_by_user_erased_at IS DISTINCT FROM OLD.approved_by_user_erased_at THEN
    RAISE EXCEPTION 'copyright staff alert policy approver erasure is system-managed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_staff_alert_policies_guard
  BEFORE UPDATE OR DELETE ON copyright_staff_alert_policies
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_staff_alert_policy();
CREATE TRIGGER trigger_copyright_staff_alert_policies_updated_at
  BEFORE UPDATE ON copyright_staff_alert_policies
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_guard_copyright_staff_alert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright staff alerts are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.copyright_notice_id IS DISTINCT FROM NEW.copyright_notice_id
    OR OLD.copyright_notice_deadline_id IS DISTINCT FROM NEW.copyright_notice_deadline_id
    OR OLD.copyright_notice_delivery_intent_id IS DISTINCT FROM NEW.copyright_notice_delivery_intent_id
    OR OLD.condition IS DISTINCT FROM NEW.condition THEN
    RAISE EXCEPTION 'copyright staff alert identity is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_staff_alerts_guard
  BEFORE UPDATE OR DELETE ON copyright_staff_alerts
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_staff_alert();
CREATE TRIGGER trigger_copyright_staff_alerts_updated_at
  BEFORE UPDATE ON copyright_staff_alerts
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_guard_copyright_staff_alert_ack()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright staff alert acknowledgements are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.copyright_staff_alert_id IS DISTINCT FROM NEW.copyright_staff_alert_id
    OR OLD.acknowledged_at IS DISTINCT FROM NEW.acknowledged_at
    OR OLD.condition_opened_at IS DISTINCT FROM NEW.condition_opened_at THEN
    RAISE EXCEPTION 'copyright staff alert acknowledgement facts are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.acknowledged_by_user_id IS DISTINCT FROM NEW.acknowledged_by_user_id THEN
    IF OLD.acknowledged_by_user_id IS NULL OR NEW.acknowledged_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'copyright staff alert acknowledger cannot change' USING ERRCODE = 'check_violation';
    END IF;
    NEW.acknowledged_by_user_erased_at := CURRENT_TIMESTAMP;
  ELSIF NEW.acknowledged_by_user_erased_at IS DISTINCT FROM OLD.acknowledged_by_user_erased_at THEN
    RAISE EXCEPTION 'copyright staff alert acknowledger erasure is system-managed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_staff_alert_acks_guard
  BEFORE UPDATE OR DELETE ON copyright_staff_alert_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_staff_alert_ack();
CREATE TRIGGER trigger_copyright_staff_alert_acks_updated_at
  BEFORE UPDATE ON copyright_staff_alert_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE copyright_staff_alert_policies IS 'Retained approval to derive copyright staff alerts. Absent or revoked rows keep derivation and staff reads closed. The row stores no operator threshold and no notification destination.';
COMMENT ON COLUMN copyright_staff_alert_policies.approved_at IS 'Time a staff user approved deriving alerts from current case, deadline, and delivery facts.';
COMMENT ON COLUMN copyright_staff_alert_policies.approved_by_user_id IS 'Staff user who approved the policy; null after that account is erased.';
COMMENT ON COLUMN copyright_staff_alert_policies.approved_by_user_erased_at IS 'Time account erasure removed the approver reference while retaining the policy.';
COMMENT ON COLUMN copyright_staff_alert_policies.revoked_at IS 'Time this approval was revoked. A revoked policy does not authorize alerts.';
COMMENT ON TABLE copyright_staff_alerts IS 'One retained alert per case, deadline, or delivery source and condition. Acknowledgement does not delete the source obligation.';
COMMENT ON COLUMN copyright_staff_alerts.copyright_notice_id IS 'Copyright case that owns the alert.';
COMMENT ON COLUMN copyright_staff_alerts.copyright_notice_deadline_id IS 'Statutory deadline whose missed restoration time opened this alert; null for case and delivery conditions.';
COMMENT ON COLUMN copyright_staff_alerts.copyright_notice_delivery_intent_id IS 'Delivery obligation whose failure, bounce, or retry opened this alert; null for case and deadline conditions.';
COMMENT ON COLUMN copyright_staff_alerts.condition IS 'Derived condition: awaiting review, urgent filing, missed deadline, delivery failure, bounce, or reconciliation need.';
COMMENT ON COLUMN copyright_staff_alerts.condition_opened_at IS 'Source timestamp of the current episode. A later timestamp reopens the alert after acknowledgement.';
COMMENT ON COLUMN copyright_staff_alerts.resolved_at IS 'Time the source condition cleared. Set again to null when that condition returns.';
COMMENT ON TABLE copyright_staff_alert_acknowledgements IS 'Append-only acknowledgement of one alert episode. A new episode keeps the prior row and becomes visible again.';
COMMENT ON COLUMN copyright_staff_alert_acknowledgements.copyright_staff_alert_id IS 'Alert episode family this acknowledgement belongs to.';
COMMENT ON COLUMN copyright_staff_alert_acknowledgements.acknowledged_at IS 'Time a staff user acknowledged that episode.';
COMMENT ON COLUMN copyright_staff_alert_acknowledgements.acknowledged_by_user_id IS 'Staff user who acknowledged the episode; null after that account is erased.';
COMMENT ON COLUMN copyright_staff_alert_acknowledgements.acknowledged_by_user_erased_at IS 'Time account erasure removed the acknowledger reference while retaining the acknowledgement.';
COMMENT ON COLUMN copyright_staff_alert_acknowledgements.condition_opened_at IS 'Episode timestamp that was acknowledged. It matches the alert only while that episode is current.';
