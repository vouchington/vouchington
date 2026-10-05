-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Append-only audit log for community agent prompt changes made by moderators.
DO $$
BEGIN
  CREATE TYPE community_agent_prompt_revision_types AS ENUM
    ('created', 'updated', 'deleted', 'allocated', 'deallocated', 'deactivated');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS community_agent_prompt_revisions (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  community_id     uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  community_agent_prompt_id uuid NOT NULL REFERENCES community_agent_prompts(id) ON DELETE CASCADE,
  revised_by_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  revision_type community_agent_prompt_revision_types NOT NULL,
  changes jsonb NOT NULL,
  created_at       timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE INDEX IF NOT EXISTS community_agent_prompt_revisions_community_id_idx
  ON community_agent_prompt_revisions (community_id, id DESC);

CREATE INDEX IF NOT EXISTS community_agent_prompt_revisions_community_agent_prompt_id_idx
  ON community_agent_prompt_revisions (community_agent_prompt_id, id DESC);

COMMENT ON TABLE community_agent_prompt_revisions IS 'Append-only audit log of community agent prompt changes made by moderators.';
COMMENT ON COLUMN community_agent_prompt_revisions.community_id IS 'Community that owns the changed prompt; rows cascade-deleted with the community.';
COMMENT ON COLUMN community_agent_prompt_revisions.community_agent_prompt_id IS 'Concrete prompt revised by this field-diff row; cascades with its parent.';
COMMENT ON COLUMN community_agent_prompt_revisions.revised_by_id IS 'Moderator who made the change; SET NULL on user deletion.';
COMMENT ON COLUMN community_agent_prompt_revisions.revision_type IS 'Type of change applied to the prompt (created, updated, deleted, allocated, deallocated, deactivated).';
COMMENT ON COLUMN community_agent_prompt_revisions.changes IS 'Per-field before/after differences; unchanged fields are omitted.';
CREATE TRIGGER trigger_community_agent_prompt_revisions_append_only BEFORE UPDATE OR DELETE ON community_agent_prompt_revisions FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation('revised_by_id');
