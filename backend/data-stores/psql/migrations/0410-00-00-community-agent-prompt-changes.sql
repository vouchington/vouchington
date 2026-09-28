-- Append-only audit log for community agent prompt changes made by moderators.
DO $$
BEGIN
  CREATE TYPE community_agent_prompt_change_action AS ENUM
    ('created', 'updated', 'deleted', 'allocated', 'deallocated', 'deactivated');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS community_agent_prompt_changes (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  community_id     uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  agent_prompt_id  uuid NOT NULL REFERENCES retained_community_agent_prompt_identities (id) ON DELETE RESTRICT,
  changed_by_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action           community_agent_prompt_change_action NOT NULL,
  previous_has_prompt BOOLEAN NOT NULL DEFAULT FALSE,
  previous_prompt TEXT,
  next_has_prompt BOOLEAN NOT NULL DEFAULT FALSE,
  next_prompt TEXT,
  previous_has_model_name BOOLEAN NOT NULL DEFAULT FALSE,
  previous_model_name TEXT,
  next_has_model_name BOOLEAN NOT NULL DEFAULT FALSE,
  next_model_name TEXT,
  previous_has_model_provider BOOLEAN NOT NULL DEFAULT FALSE,
  previous_model_provider TEXT,
  next_has_model_provider BOOLEAN NOT NULL DEFAULT FALSE,
  next_model_provider TEXT,
  previous_has_slot_allocated BOOLEAN NOT NULL DEFAULT FALSE,
  previous_slot_allocated BOOLEAN,
  next_has_slot_allocated BOOLEAN NOT NULL DEFAULT FALSE,
  next_slot_allocated BOOLEAN,
  previous_has_on_flag_action BOOLEAN NOT NULL DEFAULT FALSE,
  previous_on_flag_action community_prompt_on_flag_action,
  next_has_on_flag_action BOOLEAN NOT NULL DEFAULT FALSE,
  next_on_flag_action community_prompt_on_flag_action,
  previous_has_activated_at BOOLEAN NOT NULL DEFAULT FALSE,
  previous_activated_at TIMESTAMPTZ,
  next_has_activated_at BOOLEAN NOT NULL DEFAULT FALSE,
  next_activated_at TIMESTAMPTZ,
  previous_has_deactivated_at BOOLEAN NOT NULL DEFAULT FALSE,
  previous_deactivated_at TIMESTAMPTZ,
  next_has_deactivated_at BOOLEAN NOT NULL DEFAULT FALSE,
  next_deactivated_at TIMESTAMPTZ,
  previous_has_deleted_at BOOLEAN NOT NULL DEFAULT FALSE,
  previous_deleted_at TIMESTAMPTZ,
  next_has_deleted_at BOOLEAN NOT NULL DEFAULT FALSE,
  next_deleted_at TIMESTAMPTZ,
  created_at       timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE INDEX IF NOT EXISTS community_agent_prompt_changes_community_id_idx
  ON community_agent_prompt_changes (community_id, id DESC);

CREATE INDEX IF NOT EXISTS community_agent_prompt_changes_agent_prompt_id_idx
  ON community_agent_prompt_changes (agent_prompt_id, id DESC);

COMMENT ON TABLE community_agent_prompt_changes IS 'Append-only audit log of community agent prompt changes made by moderators.';
COMMENT ON COLUMN community_agent_prompt_changes.community_id IS 'Community that owns the changed prompt; rows cascade-deleted with the community.';
COMMENT ON COLUMN community_agent_prompt_changes.agent_prompt_id IS 'Retained community agent prompt identity. History survives hard deletion and the root does not authorize the prompt.';
COMMENT ON COLUMN community_agent_prompt_changes.changed_by_id IS 'Moderator who made the change; SET NULL on user deletion.';
COMMENT ON COLUMN community_agent_prompt_changes.action IS 'Type of change applied to the prompt (created, updated, deleted, allocated, deallocated, deactivated).';

DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'previous_has_prompt','previous_prompt','next_has_prompt','next_prompt',
    'previous_has_model_name','previous_model_name','next_has_model_name','next_model_name',
    'previous_has_model_provider','previous_model_provider','next_has_model_provider','next_model_provider',
    'previous_has_slot_allocated','previous_slot_allocated','next_has_slot_allocated','next_slot_allocated',
    'previous_has_on_flag_action','previous_on_flag_action','next_has_on_flag_action','next_on_flag_action',
    'previous_has_activated_at','previous_activated_at','next_has_activated_at','next_activated_at',
    'previous_has_deactivated_at','previous_deactivated_at','next_has_deactivated_at','next_deactivated_at',
    'previous_has_deleted_at','previous_deleted_at','next_has_deleted_at','next_deleted_at'
  ]
  LOOP
    EXECUTE format('COMMENT ON COLUMN community_agent_prompt_changes.%I IS %L', col, 'Prompt audit snapshot field. The has flag is false when that side omitted the key; a true flag with a null value stores an explicit null.');
  END LOOP;
END $$;
