-- DSA Article 22 trusted flagger designations and receipt-time matches. Priority remains off
-- until the copyright dynamic switch and the EU jurisdiction approval are both active.

CREATE TYPE copyright_trusted_flagger_change_types AS ENUM (
  'suspended',
  'reinstated',
  'revoked'
);

CREATE TABLE copyright_trusted_flaggers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  awarding_coordinator_name text NOT NULL CHECK (char_length(awarding_coordinator_name) BETWEEN 1 AND 200),
  awarding_member_state text NOT NULL CHECK (awarding_member_state ~ '^[A-Z]{2}$'),
  awarded_at date NOT NULL,
  award_reference text CHECK (award_reference IS NULL OR char_length(award_reference) BETWEEN 1 AND 2048),
  area_of_expertise text NOT NULL CHECK (area_of_expertise IN ('intellectual_property', 'other')),
  area_description text NOT NULL CHECK (char_length(area_description) BETWEEN 1 AND 500),
  created_by_id uuid NOT NULL REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_copyright_trusted_flaggers__user_id
  ON copyright_trusted_flaggers (user_id, id DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_copyright_trusted_flaggers__created_by_id
  ON copyright_trusted_flaggers (created_by_id);
CREATE TRIGGER trigger_copyright_trusted_flaggers_updated_at
  BEFORE UPDATE ON copyright_trusted_flaggers
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE copyright_trusted_flagger_changes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_trusted_flagger_id uuid NOT NULL REFERENCES copyright_trusted_flaggers(id) ON DELETE RESTRICT,
  change_type copyright_trusted_flagger_change_types NOT NULL,
  changed_by_id uuid NOT NULL REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 4000),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_copyright_trusted_flagger_changes__entry_id__id
  ON copyright_trusted_flagger_changes (copyright_trusted_flagger_id, id DESC);
CREATE INDEX idx_copyright_trusted_flagger_changes__changed_by_id
  ON copyright_trusted_flagger_changes (changed_by_id);
CREATE TRIGGER trigger_copyright_trusted_flagger_changes_immutable
  BEFORE UPDATE OR DELETE ON copyright_trusted_flagger_changes
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

CREATE TABLE copyright_trusted_flagger_matches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL UNIQUE REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_trusted_flagger_id uuid NOT NULL REFERENCES copyright_trusted_flaggers(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_copyright_trusted_flagger_matches__entry_id
  ON copyright_trusted_flagger_matches (copyright_trusted_flagger_id);
CREATE TRIGGER trigger_copyright_trusted_flagger_matches_immutable
  BEFORE UPDATE OR DELETE ON copyright_trusted_flagger_matches
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

COMMENT ON TABLE copyright_trusted_flaggers IS 'Staff-recorded Digital Services Coordinator designation for a trusted flagger. The linked live account is the sole match key; its deletion removes only that link.';
COMMENT ON COLUMN copyright_trusted_flaggers.id IS 'UUIDv7 designation identifier.';
COMMENT ON COLUMN copyright_trusted_flaggers.name IS 'Entity name as published in the Commission trusted-flagger list.';
COMMENT ON COLUMN copyright_trusted_flaggers.user_id IS 'Live signed-in account whose EU notices can match; null after account deletion and never inferred from email.';
COMMENT ON COLUMN copyright_trusted_flaggers.awarding_coordinator_name IS 'Digital Services Coordinator that awarded the designation.';
COMMENT ON COLUMN copyright_trusted_flaggers.awarding_member_state IS 'Uppercase two-letter Member State code of the awarding coordinator.';
COMMENT ON COLUMN copyright_trusted_flaggers.awarded_at IS 'Date the coordinator awarded the designation.';
COMMENT ON COLUMN copyright_trusted_flaggers.award_reference IS 'Optional published award URL or document identifier.';
COMMENT ON COLUMN copyright_trusted_flaggers.area_of_expertise IS 'Closed platform category for the designated expertise; only intellectual_property is in area for copyright notices.';
COMMENT ON COLUMN copyright_trusted_flaggers.area_description IS 'Designation wording for the area of expertise.';
COMMENT ON COLUMN copyright_trusted_flaggers.created_by_id IS 'Retained identity of the administrator who recorded this designation; never an authorization source.';
COMMENT ON COLUMN copyright_trusted_flaggers.created_at IS 'Creation time derived from the UUIDv7 identifier.';
COMMENT ON COLUMN copyright_trusted_flaggers.updated_at IS 'Last database update, including removal of a deleted account link.';

COMMENT ON TABLE copyright_trusted_flagger_changes IS 'Append-only status transitions; the latest change determines whether a designation is active, suspended or revoked.';
COMMENT ON COLUMN copyright_trusted_flagger_changes.id IS 'UUIDv7 status-change identifier.';
COMMENT ON COLUMN copyright_trusted_flagger_changes.copyright_trusted_flagger_id IS 'Designation whose status changed.';
COMMENT ON COLUMN copyright_trusted_flagger_changes.change_type IS 'Suspension, reinstatement or final revocation.';
COMMENT ON COLUMN copyright_trusted_flagger_changes.changed_by_id IS 'Retained identity of the administrator who recorded the transition.';
COMMENT ON COLUMN copyright_trusted_flagger_changes.reason IS 'Staff reason for the recorded status transition.';
COMMENT ON COLUMN copyright_trusted_flagger_changes.created_at IS 'Transition time derived from the UUIDv7 identifier.';
COMMENT ON COLUMN copyright_trusted_flagger_changes.updated_at IS 'Insert timestamp; immutable rows cannot be updated.';

COMMENT ON TABLE copyright_trusted_flagger_matches IS 'Immutable match captured when a signed-in linked account files an EU copyright notice; matches are recorded even while priority is off.';
COMMENT ON COLUMN copyright_trusted_flagger_matches.id IS 'UUIDv7 receipt-time match identifier.';
COMMENT ON COLUMN copyright_trusted_flagger_matches.copyright_notice_id IS 'EU notice that matched one active designation at receipt time.';
COMMENT ON COLUMN copyright_trusted_flagger_matches.copyright_trusted_flagger_id IS 'Designation selected at receipt time, preferring intellectual-property expertise.';
COMMENT ON COLUMN copyright_trusted_flagger_matches.created_at IS 'Match time derived from the UUIDv7 identifier.';
COMMENT ON COLUMN copyright_trusted_flagger_matches.updated_at IS 'Insert timestamp; immutable rows cannot be updated.';
