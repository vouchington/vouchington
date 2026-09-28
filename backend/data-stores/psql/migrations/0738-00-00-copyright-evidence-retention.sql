-- Fail-closed copyright evidence retention. No retention period is stored.
-- The gate row is inserted disabled. Nothing in this migration deletes an object.

CREATE TABLE copyright_evidence_retention_gate (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX copyright_evidence_retention_gate_singleton
  ON copyright_evidence_retention_gate ((true));

INSERT INTO copyright_evidence_retention_gate (enabled) VALUES (false);

CREATE TABLE copyright_evidence_retention_policies (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((approved_at IS NULL) = (approved_by_user_id IS NULL))
);

CREATE TABLE copyright_notice_closures (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL UNIQUE REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  closed_at timestamptz NOT NULL,
  closed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_evidence_retention_previews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_evidence_retention_policy_id uuid REFERENCES copyright_evidence_retention_policies(id) ON DELETE RESTRICT,
  eligible boolean NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_evidence_retention_preview_blocks (
  copyright_evidence_retention_preview_id uuid NOT NULL REFERENCES copyright_evidence_retention_previews(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN (
    'gate_disabled', 'policy_unapproved', 'case_open', 'legal_hold', 'open_deadline'
  )),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (copyright_evidence_retention_preview_id, reason)
);

CREATE TABLE copyright_evidence_retention_preview_artifacts (
  copyright_evidence_retention_preview_id uuid NOT NULL REFERENCES copyright_evidence_retention_previews(id) ON DELETE RESTRICT,
  copyright_notice_evidence_artifact_id uuid NOT NULL REFERENCES copyright_notice_evidence_artifacts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (copyright_evidence_retention_preview_id, copyright_notice_evidence_artifact_id)
);

CREATE TABLE copyright_evidence_retention_preview_email_intakes (
  copyright_evidence_retention_preview_id uuid NOT NULL REFERENCES copyright_evidence_retention_previews(id) ON DELETE RESTRICT,
  copyright_notice_email_intake_id uuid NOT NULL REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (copyright_evidence_retention_preview_id, copyright_notice_email_intake_id)
);

CREATE TABLE copyright_evidence_retention_dispositions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_evidence_retention_preview_id uuid NOT NULL UNIQUE REFERENCES copyright_evidence_retention_previews(id) ON DELETE RESTRICT,
  attempted_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('refused', 'not_destroyed')),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_evidence_retention_disposition_artifacts (
  copyright_evidence_retention_disposition_id uuid NOT NULL REFERENCES copyright_evidence_retention_dispositions(id) ON DELETE RESTRICT,
  copyright_notice_evidence_artifact_id uuid NOT NULL REFERENCES copyright_notice_evidence_artifacts(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('refused', 'not_destroyed')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (copyright_evidence_retention_disposition_id, copyright_notice_evidence_artifact_id)
);

CREATE TABLE copyright_evidence_retention_disposition_email_intakes (
  copyright_evidence_retention_disposition_id uuid NOT NULL REFERENCES copyright_evidence_retention_dispositions(id) ON DELETE RESTRICT,
  copyright_notice_email_intake_id uuid NOT NULL REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('refused', 'not_destroyed')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (copyright_evidence_retention_disposition_id, copyright_notice_email_intake_id)
);

COMMENT ON TABLE copyright_evidence_retention_gate IS 'Single server-owned switch for copyright evidence disposition. The inserted row is disabled.';
COMMENT ON COLUMN copyright_evidence_retention_gate.enabled IS 'Whether a later destruction authority may run. False records no deletion.';
COMMENT ON TABLE copyright_evidence_retention_policies IS 'Approved evidence-retention policy versions. No duration is stored here.';
COMMENT ON COLUMN copyright_evidence_retention_policies.approved_at IS 'When a person approved this policy version. Null means it is not approved.';
COMMENT ON TABLE copyright_notice_closures IS 'Staff record that a copyright case is closed. Closure does not delete evidence.';
COMMENT ON COLUMN copyright_notice_closures.closed_at IS 'When staff recorded the case closed.';
COMMENT ON TABLE copyright_evidence_retention_previews IS 'Immutable explanation of what a disposition would affect, and why it is blocked.';
COMMENT ON COLUMN copyright_evidence_retention_previews.eligible IS 'True only when the gate, policy, closure, holds, and deadlines all allow a later destruction authority.';
COMMENT ON COLUMN copyright_evidence_retention_preview_blocks.reason IS 'One fail-closed reason for this preview.';
COMMENT ON TABLE copyright_evidence_retention_dispositions IS 'Audit of a disposition attempt. This table never authorizes object deletion by itself.';
COMMENT ON COLUMN copyright_evidence_retention_dispositions.outcome IS 'refused when a block remains. not_destroyed when the preview is eligible but destruction authority is absent.';
COMMENT ON COLUMN copyright_evidence_retention_disposition_artifacts.outcome IS 'Per-artifact result copied from the disposition. The artifact row is kept.';
COMMENT ON COLUMN copyright_evidence_retention_disposition_email_intakes.outcome IS 'Per-intake result copied from the disposition. The raw message is kept.';
