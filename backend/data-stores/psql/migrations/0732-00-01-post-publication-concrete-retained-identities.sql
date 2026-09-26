-- Concrete repair relationships retain immutable identity while live deletion clears only the FK.
CREATE TABLE IF NOT EXISTS post_publication_post_identities (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES posts (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (post_id IS NULL OR post_id = id)
) PARTITION BY RANGE (id);
CREATE INDEX IF NOT EXISTS idx_post_publication_post_identities__post_id ON post_publication_post_identities (post_id) WHERE post_id IS NOT NULL;
COMMENT ON TABLE post_publication_post_identities IS 'Durable post identity referenced by accepted receipts and snapshots; UUIDv7 range partitions bound target-scoped access and bounded sweeps reclaim unreferenced rows.';
COMMENT ON COLUMN post_publication_post_identities.post_id IS 'Live entity FK; deletion clears this link without deleting historical repair identity.';
CREATE TABLE IF NOT EXISTS post_publication_community_identities (
  id UUID PRIMARY KEY,
  community_id UUID UNIQUE REFERENCES communities (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (community_id IS NULL OR community_id = id)
);
COMMENT ON TABLE post_publication_community_identities IS 'Repair-only identity bridge; unreferenced rows are reclaimed in bounded pages.';
COMMENT ON COLUMN post_publication_community_identities.community_id IS 'Live entity FK; deletion clears this link without deleting historical repair identity.';
CREATE TABLE IF NOT EXISTS post_publication_rss_feed_item_identities (
  id UUID PRIMARY KEY,
  rss_feed_item_id UUID UNIQUE REFERENCES rss_feed_items (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (rss_feed_item_id IS NULL OR rss_feed_item_id = id)
);
COMMENT ON TABLE post_publication_rss_feed_item_identities IS 'Repair-only identity bridge; unreferenced rows are reclaimed in bounded pages.';
COMMENT ON COLUMN post_publication_rss_feed_item_identities.rss_feed_item_id IS 'Live entity FK; deletion clears this link without deleting historical repair identity.';
CREATE TABLE IF NOT EXISTS post_publication_author_identities (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (user_id IS NULL OR user_id = id)
);
COMMENT ON TABLE post_publication_author_identities IS 'Repair-only identity bridge; unreferenced rows are reclaimed in bounded pages.';
COMMENT ON COLUMN post_publication_author_identities.user_id IS 'Live entity FK; deletion clears this link without deleting historical repair identity.';
CREATE TABLE IF NOT EXISTS post_publication_rss_feed_identities (
  id UUID PRIMARY KEY,
  rss_feed_id UUID UNIQUE REFERENCES rss_feeds (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (rss_feed_id IS NULL OR rss_feed_id = id)
);
COMMENT ON TABLE post_publication_rss_feed_identities IS 'Repair-only identity bridge; unreferenced rows are reclaimed in bounded pages.';
COMMENT ON COLUMN post_publication_rss_feed_identities.rss_feed_id IS 'Live entity FK; deletion clears this link without deleting historical repair identity.';
CREATE TABLE IF NOT EXISTS post_publication_topic_alias_identities (
  id UUID PRIMARY KEY,
  topic_alias_id UUID UNIQUE REFERENCES topic_aliases (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (topic_alias_id IS NULL OR topic_alias_id = id)
);
COMMENT ON TABLE post_publication_topic_alias_identities IS 'Repair-only identity bridge; unreferenced rows are reclaimed in bounded pages.';
COMMENT ON COLUMN post_publication_topic_alias_identities.topic_alias_id IS 'Live entity FK; deletion clears this link without deleting historical repair identity.';
CREATE TABLE IF NOT EXISTS post_publication_story_identities (
  id UUID PRIMARY KEY,
  story_id UUID UNIQUE REFERENCES stories (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (story_id IS NULL OR story_id = id)
);
COMMENT ON TABLE post_publication_story_identities IS 'Repair-only identity bridge; unreferenced rows are reclaimed in bounded pages.';
COMMENT ON COLUMN post_publication_story_identities.story_id IS 'Live entity FK; deletion clears this link without deleting historical repair identity.';

CREATE OR REPLACE TRIGGER trigger_pub_post_identities_updated_at BEFORE UPDATE ON post_publication_post_identities FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE OR REPLACE TRIGGER trigger_pub_community_identities_updated_at BEFORE UPDATE ON post_publication_community_identities FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE OR REPLACE TRIGGER trigger_pub_rss_feed_item_identities_updated_at BEFORE UPDATE ON post_publication_rss_feed_item_identities FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE OR REPLACE TRIGGER trigger_pub_author_identities_updated_at BEFORE UPDATE ON post_publication_author_identities FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE OR REPLACE TRIGGER trigger_pub_rss_feed_identities_updated_at BEFORE UPDATE ON post_publication_rss_feed_identities FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE OR REPLACE TRIGGER trigger_pub_topic_alias_identities_updated_at BEFORE UPDATE ON post_publication_topic_alias_identities FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE OR REPLACE TRIGGER trigger_pub_story_identities_updated_at BEFORE UPDATE ON post_publication_story_identities FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS post_publication_identity_bridge_cleanup_progress (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  family TEXT NOT NULL DEFAULT 'post' CHECK (family IN ('post', 'community', 'rss_feed_item', 'author', 'rss_feed', 'topic_alias', 'story')),
  cursor_identity_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO post_publication_identity_bridge_cleanup_progress (singleton) VALUES (TRUE) ON CONFLICT DO NOTHING;
COMMENT ON TABLE post_publication_identity_bridge_cleanup_progress IS 'Checked singleton rotates bounded identity bridge sweeps across concrete entity tables.';
COMMENT ON COLUMN post_publication_identity_bridge_cleanup_progress.singleton IS 'One independent bridge cleanup cursor.';
COMMENT ON COLUMN post_publication_identity_bridge_cleanup_progress.family IS 'Current concrete table sweep, not an entity relationship.';
COMMENT ON COLUMN post_publication_identity_bridge_cleanup_progress.cursor_identity_id IS 'Deletion-stable last raw candidate key, not an entity relationship.';
COMMENT ON COLUMN post_publication_identity_bridge_cleanup_progress.updated_at IS 'Last committed bounded bridge sweep.';

-- squawk-ignore renaming-column -- Pre-launch ownership now references the concrete post bridge; all receipt readers and writers use this FK name together.
ALTER TABLE post_publication_projection_receipts RENAME COLUMN post_id TO post_identity_id;
ALTER TABLE post_publication_projection_receipts ADD CONSTRAINT fk_post_publication_projection_receipts__post_identity FOREIGN KEY (post_identity_id) REFERENCES post_publication_post_identities (id) ON DELETE RESTRICT NOT VALID; -- fk-index-guard-allow: RENAME COLUMN preserves the existing leading PRIMARY KEY on parent and leaves; real catalog regression verifies it, SQL analyzer does not propagate renames.
ALTER TABLE post_publication_projection_receipts VALIDATE CONSTRAINT fk_post_publication_projection_receipts__post_identity;
COMMENT ON COLUMN post_publication_projection_receipts.post_identity_id IS 'Concrete durable post identity FK; live post access follows the bridge post_id FK.';
ALTER TABLE post_publication_identity_snapshots ADD CONSTRAINT fk_post_publication_identity_snapshots__post_identity FOREIGN KEY (post_identity_id) REFERENCES post_publication_post_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_identity_snapshots VALIDATE CONSTRAINT fk_post_publication_identity_snapshots__post_identity;
COMMENT ON COLUMN post_publication_identity_snapshots.post_identity_id IS 'Concrete durable post identity FK; live post access follows the bridge post_id FK.';

-- squawk-ignore ban-drop-column -- Pre-launch concrete payload columns replace polymorphic storage; incompatible disposable databases require explicit recreation.
ALTER TABLE post_publication_dirty_work_keys DROP COLUMN kind, DROP COLUMN uuid_value, DROP COLUMN text_value;
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN impact_post_identity_id UUID;
COMMENT ON COLUMN post_publication_dirty_work_keys.impact_post_identity_id IS 'Concrete durable repair identity relationship.';
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN impact_community_identity_id UUID;
COMMENT ON COLUMN post_publication_dirty_work_keys.impact_community_identity_id IS 'Concrete durable repair identity relationship.';
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN impact_rss_feed_item_identity_id UUID;
COMMENT ON COLUMN post_publication_dirty_work_keys.impact_rss_feed_item_identity_id IS 'Concrete durable repair identity relationship.';
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN topic_key UUID;
COMMENT ON COLUMN post_publication_dirty_work_keys.topic_key IS 'Immutable topic key projection value, never joined to a live entity.';
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN author_key UUID;
COMMENT ON COLUMN post_publication_dirty_work_keys.author_key IS 'Immutable author key projection value, never joined to a live entity.';
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN community_key UUID;
COMMENT ON COLUMN post_publication_dirty_work_keys.community_key IS 'Immutable community key projection value, never joined to a live entity.';
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN rss_feed_key UUID;
COMMENT ON COLUMN post_publication_dirty_work_keys.rss_feed_key IS 'Immutable rss feed key projection value, never joined to a live entity.';
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN author_username TEXT;
COMMENT ON COLUMN post_publication_dirty_work_keys.author_username IS 'Immutable author username projection value, never joined to a live entity.';
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN post_slug TEXT;
COMMENT ON COLUMN post_publication_dirty_work_keys.post_slug IS 'Immutable post slug projection value, never joined to a live entity.';
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN community_slug TEXT;
COMMENT ON COLUMN post_publication_dirty_work_keys.community_slug IS 'Immutable community slug projection value, never joined to a live entity.';
ALTER TABLE post_publication_dirty_work_keys ADD COLUMN topic_alias TEXT;
COMMENT ON COLUMN post_publication_dirty_work_keys.topic_alias IS 'Immutable topic alias projection value, never joined to a live entity.';
ALTER TABLE post_publication_dirty_work_keys ADD CONSTRAINT chk_post_publication_dirty_work_keys__concrete_payload CHECK (num_nonnulls(impact_post_identity_id, impact_community_identity_id, impact_rss_feed_item_identity_id, topic_key, author_key, community_key, rss_feed_key, author_username, post_slug, community_slug, topic_alias, post_type) = 1 AND ((post_type IS NULL) = (day IS NULL))) NOT VALID;
ALTER TABLE post_publication_dirty_work_keys VALIDATE CONSTRAINT chk_post_publication_dirty_work_keys__concrete_payload;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_dirty_work_keys__concrete_payload ON post_publication_dirty_work_keys (dirty_work_id, impact_post_identity_id, impact_community_identity_id, impact_rss_feed_item_identity_id, topic_key, author_key, community_key, rss_feed_key, author_username, post_slug, community_slug, topic_alias, post_type, day) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_post_publication_dirty_work_keys__topic_key ON post_publication_dirty_work_keys (dirty_work_id, topic_key) WHERE topic_key IS NOT NULL;
ALTER TABLE post_publication_dirty_work_keys ADD CONSTRAINT fk_post_publication_dirty_work_keys__post_identity FOREIGN KEY (impact_post_identity_id) REFERENCES post_publication_post_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_dirty_work_keys VALIDATE CONSTRAINT fk_post_publication_dirty_work_keys__post_identity;
CREATE INDEX IF NOT EXISTS idx_post_publication_dirty_work_keys__impact_post_identity_id ON post_publication_dirty_work_keys (impact_post_identity_id) WHERE impact_post_identity_id IS NOT NULL;
ALTER TABLE post_publication_dirty_work_keys ADD CONSTRAINT fk_post_publication_dirty_work_keys__community_identity FOREIGN KEY (impact_community_identity_id) REFERENCES post_publication_community_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_dirty_work_keys VALIDATE CONSTRAINT fk_post_publication_dirty_work_keys__community_identity;
CREATE INDEX IF NOT EXISTS idx_post_pub_dirty_work_keys__impact_community_identity_id ON post_publication_dirty_work_keys (impact_community_identity_id) WHERE impact_community_identity_id IS NOT NULL;
ALTER TABLE post_publication_dirty_work_keys ADD CONSTRAINT fk_post_publication_dirty_work_keys__rss_feed_item_identity FOREIGN KEY (impact_rss_feed_item_identity_id) REFERENCES post_publication_rss_feed_item_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_dirty_work_keys VALIDATE CONSTRAINT fk_post_publication_dirty_work_keys__rss_feed_item_identity;
CREATE INDEX IF NOT EXISTS idx_post_pub_dirty_work_keys__impact_rss_feed_item_identity_id ON post_publication_dirty_work_keys (impact_rss_feed_item_identity_id) WHERE impact_rss_feed_item_identity_id IS NOT NULL;

ALTER TABLE post_publication_dirty_work ADD CONSTRAINT fk_post_publication_dirty_work__post_identity FOREIGN KEY (post_id) REFERENCES post_publication_post_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_dirty_work VALIDATE CONSTRAINT fk_post_publication_dirty_work__post_identity;
COMMENT ON COLUMN post_publication_dirty_work.post_id IS 'Exact post repair scope, referencing durable post identity rather than the nullable live entity.';
ALTER TABLE post_publication_dirty_work ADD CONSTRAINT fk_post_publication_dirty_work__community_identity FOREIGN KEY (community_id) REFERENCES post_publication_community_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_dirty_work VALIDATE CONSTRAINT fk_post_publication_dirty_work__community_identity;
COMMENT ON COLUMN post_publication_dirty_work.community_id IS 'Exact community repair scope, referencing durable community identity rather than the nullable live entity.';
ALTER TABLE post_publication_dirty_work ADD CONSTRAINT fk_post_publication_dirty_work__author_identity FOREIGN KEY (author_user_id) REFERENCES post_publication_author_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_dirty_work VALIDATE CONSTRAINT fk_post_publication_dirty_work__author_identity;
COMMENT ON COLUMN post_publication_dirty_work.author_user_id IS 'Exact author repair scope, referencing durable author identity rather than the nullable live entity.';
ALTER TABLE post_publication_dirty_work ADD CONSTRAINT fk_post_publication_dirty_work__rss_feed_identity FOREIGN KEY (rss_feed_id) REFERENCES post_publication_rss_feed_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_dirty_work VALIDATE CONSTRAINT fk_post_publication_dirty_work__rss_feed_identity;
COMMENT ON COLUMN post_publication_dirty_work.rss_feed_id IS 'Exact rss_feed repair scope, referencing durable rss_feed identity rather than the nullable live entity.';
ALTER TABLE post_publication_dirty_work ADD CONSTRAINT fk_post_publication_dirty_work__topic_alias_identity FOREIGN KEY (topic_alias_id) REFERENCES post_publication_topic_alias_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_dirty_work VALIDATE CONSTRAINT fk_post_publication_dirty_work__topic_alias_identity;
COMMENT ON COLUMN post_publication_dirty_work.topic_alias_id IS 'Exact topic_alias repair scope, referencing durable topic_alias identity rather than the nullable live entity.';
ALTER TABLE post_publication_dirty_work ADD CONSTRAINT fk_post_publication_dirty_work__story_identity FOREIGN KEY (story_id) REFERENCES post_publication_story_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_dirty_work VALIDATE CONSTRAINT fk_post_publication_dirty_work__story_identity;
COMMENT ON COLUMN post_publication_dirty_work.story_id IS 'Exact story repair scope, referencing durable story identity rather than the nullable live entity.';
