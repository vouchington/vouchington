-- Fail-closed copyright evidence retention. No retention period is stored.
-- The gate row is inserted disabled. Nothing in this migration deletes an object.

CREATE TABLE copyright_evidence_retention_gates (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX copyright_evidence_retention_gates_singleton
  ON copyright_evidence_retention_gates ((true));

INSERT INTO copyright_evidence_retention_gates (enabled) VALUES (false);

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

CREATE INDEX copyright_evidence_retention_policies_approved_by_user_id
  ON copyright_evidence_retention_policies (approved_by_user_id);

CREATE INDEX copyright_notice_closures_closed_by_user_id
  ON copyright_notice_closures (closed_by_user_id);

CREATE INDEX copyright_evidence_retention_previews_copyright_notice_id
  ON copyright_evidence_retention_previews (copyright_notice_id);

CREATE INDEX copyright_evidence_retention_previews_policy_id
  ON copyright_evidence_retention_previews (copyright_evidence_retention_policy_id);

CREATE INDEX copyright_evidence_retention_preview_artifacts_artifact_id
  ON copyright_evidence_retention_preview_artifacts (copyright_notice_evidence_artifact_id);

CREATE INDEX copyright_evidence_retention_preview_email_intakes_intake_id
  ON copyright_evidence_retention_preview_email_intakes (copyright_notice_email_intake_id);

CREATE INDEX copyright_evidence_retention_disposition_artifacts_artifact_id
  ON copyright_evidence_retention_disposition_artifacts (copyright_notice_evidence_artifact_id);

CREATE INDEX idx_cer_disposition_email_intakes__intake
  ON copyright_evidence_retention_disposition_email_intakes (copyright_notice_email_intake_id);

COMMENT ON TABLE copyright_evidence_retention_gates IS 'Single server-owned switch for copyright evidence disposition. The inserted row is disabled.';
COMMENT ON COLUMN copyright_evidence_retention_gates.enabled IS 'Whether a later destruction authority may run. False records no deletion.';
COMMENT ON TABLE copyright_evidence_retention_policies IS 'Approved evidence-retention policy versions. No duration is stored here.';
COMMENT ON COLUMN copyright_evidence_retention_policies.approved_at IS 'When a person approved this policy version. Null means it is not approved.';
COMMENT ON COLUMN copyright_evidence_retention_policies.approved_by_user_id IS 'The person who approved this policy version. Null means it is not approved.';
COMMENT ON TABLE copyright_notice_closures IS 'Staff record that a copyright case is closed. Closure does not delete evidence.';
COMMENT ON COLUMN copyright_notice_closures.copyright_notice_id IS 'The copyright notice recorded as closed. One closure per notice.';
COMMENT ON COLUMN copyright_notice_closures.closed_at IS 'When staff recorded the case closed.';
COMMENT ON COLUMN copyright_notice_closures.closed_by_user_id IS 'The staff user who recorded the case closed.';
COMMENT ON TABLE copyright_evidence_retention_previews IS 'Immutable explanation of what a disposition would affect, and why it is blocked.';
COMMENT ON COLUMN copyright_evidence_retention_previews.copyright_notice_id IS 'The copyright notice this preview explains.';
COMMENT ON COLUMN copyright_evidence_retention_previews.copyright_evidence_retention_policy_id IS 'The approved policy version this preview used. Null when no policy is approved.';
COMMENT ON COLUMN copyright_evidence_retention_previews.eligible IS 'True only when the gate, policy, closure, holds, and deadlines all allow a later destruction authority.';
COMMENT ON TABLE copyright_evidence_retention_preview_blocks IS 'Fail-closed reasons recorded for one retention preview.';
COMMENT ON COLUMN copyright_evidence_retention_preview_blocks.copyright_evidence_retention_preview_id IS 'The preview these reasons explain.';
COMMENT ON COLUMN copyright_evidence_retention_preview_blocks.reason IS 'One fail-closed reason for this preview.';
COMMENT ON TABLE copyright_evidence_retention_preview_artifacts IS 'Evidence artifacts named by one preview. The artifact rows stay.';
COMMENT ON COLUMN copyright_evidence_retention_preview_artifacts.copyright_evidence_retention_preview_id IS 'The preview that names these artifacts.';
COMMENT ON COLUMN copyright_evidence_retention_preview_artifacts.copyright_notice_evidence_artifact_id IS 'The evidence artifact this preview would affect. The object is not deleted.';
COMMENT ON TABLE copyright_evidence_retention_preview_email_intakes IS 'Email intakes named by one preview. The raw messages stay.';
COMMENT ON COLUMN copyright_evidence_retention_preview_email_intakes.copyright_evidence_retention_preview_id IS 'The preview that names these intakes.';
COMMENT ON COLUMN copyright_evidence_retention_preview_email_intakes.copyright_notice_email_intake_id IS 'The email intake this preview would affect. The raw message is not deleted.';
COMMENT ON TABLE copyright_evidence_retention_dispositions IS 'Audit of a disposition attempt. This table never authorizes object deletion by itself.';
COMMENT ON COLUMN copyright_evidence_retention_dispositions.copyright_evidence_retention_preview_id IS 'The preview this attempt explains. One disposition per preview.';
COMMENT ON COLUMN copyright_evidence_retention_dispositions.attempted_at IS 'When this disposition attempt was recorded.';
COMMENT ON COLUMN copyright_evidence_retention_dispositions.outcome IS 'refused when a block remains. not_destroyed when the preview is eligible but destruction authority is absent.';
COMMENT ON TABLE copyright_evidence_retention_disposition_artifacts IS 'Per-artifact audit copied from a disposition. The artifact rows stay.';
COMMENT ON COLUMN copyright_evidence_retention_disposition_artifacts.copyright_evidence_retention_disposition_id IS 'The disposition this artifact result belongs to.';
COMMENT ON COLUMN copyright_evidence_retention_disposition_artifacts.copyright_notice_evidence_artifact_id IS 'The evidence artifact this result describes. The object is not deleted.';
COMMENT ON COLUMN copyright_evidence_retention_disposition_artifacts.outcome IS 'Per-artifact result copied from the disposition. The artifact row is kept.';
COMMENT ON TABLE copyright_evidence_retention_disposition_email_intakes IS 'Per-intake audit copied from a disposition. The raw messages stay.';
COMMENT ON COLUMN copyright_evidence_retention_disposition_email_intakes.copyright_evidence_retention_disposition_id IS 'The disposition this intake result belongs to.';
COMMENT ON COLUMN copyright_evidence_retention_disposition_email_intakes.copyright_notice_email_intake_id IS 'The email intake this result describes. The raw message is not deleted.';
COMMENT ON COLUMN copyright_evidence_retention_disposition_email_intakes.outcome IS 'Per-intake result copied from the disposition. The raw message is kept.';
