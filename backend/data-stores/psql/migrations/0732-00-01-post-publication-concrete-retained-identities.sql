-- Classifier history keeps a concrete community identity after live community deletion.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS post_publication_community_identities (
  id UUID PRIMARY KEY,
  community_id UUID UNIQUE REFERENCES communities (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (community_id IS NULL OR community_id = id)
);
COMMENT ON TABLE post_publication_community_identities IS 'Community identity retained for classifier run history after live community deletion; the generic retained-identity cleanup reclaims unreferenced rows.';
COMMENT ON COLUMN post_publication_community_identities.community_id IS 'Live community FK; deletion clears the link without removing referenced classifier history.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_published_community_identities_updated_at BEFORE UPDATE ON post_publication_community_identities FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
