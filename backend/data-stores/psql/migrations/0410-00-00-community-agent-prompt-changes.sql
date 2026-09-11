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
  -- guardrails-disable-next-line uuid-must-be-key
  agent_prompt_id  uuid NOT NULL,
  changed_by_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action           community_agent_prompt_change_action NOT NULL,
  previous_fields  jsonb NOT NULL,
  next_fields      jsonb NOT NULL,
  created_at       timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE INDEX IF NOT EXISTS community_agent_prompt_changes_community_id_idx
  ON community_agent_prompt_changes (community_id, id DESC);

CREATE INDEX IF NOT EXISTS community_agent_prompt_changes_agent_prompt_id_idx
  ON community_agent_prompt_changes (agent_prompt_id, id DESC);

COMMENT ON TABLE community_agent_prompt_changes IS 'Append-only audit log of community agent prompt changes made by moderators.';
COMMENT ON COLUMN community_agent_prompt_changes.community_id IS 'Community that owns the changed prompt; rows cascade-deleted with the community.';
COMMENT ON COLUMN community_agent_prompt_changes.agent_prompt_id IS 'ID of the community agent prompt; not a FK so history survives hard-deletes.';
COMMENT ON COLUMN community_agent_prompt_changes.changed_by_id IS 'Moderator who made the change; SET NULL on user deletion.';
COMMENT ON COLUMN community_agent_prompt_changes.action IS 'Type of change applied to the prompt (created, updated, deleted, allocated, deallocated, deactivated).';
COMMENT ON COLUMN community_agent_prompt_changes.previous_fields IS 'Snapshot of the prompt fields before the change.';
COMMENT ON COLUMN community_agent_prompt_changes.next_fields IS 'Snapshot of the prompt fields after the change.';
