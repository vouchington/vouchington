-- Lists: user-curated collections of RSS feed items and posts.
-- edited-in-place: pre-launch, never deployed to production

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'list_visibility') THEN
    CREATE TYPE list_visibility AS ENUM ('private', 'unlisted', 'public');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'list_item_types') THEN
    CREATE TYPE list_item_types AS ENUM ('rss_feed_item', 'post');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  created_via content_creation_channels,
  created_via_oauth_client_id UUID,
  CONSTRAINT lists_created_via_oauth_client_id_check CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp'))),
  owner_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  description TEXT,
  visibility list_visibility NOT NULL DEFAULT 'private',
  created_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (uuid_extract_timestamp(id)) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lists__owner_user_id
  ON lists (owner_user_id, id DESC)
  WHERE removed_at IS NULL;

CREATE TRIGGER trigger_lists_updated_at
  BEFORE UPDATE ON lists
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS list_items__rss_feed_items (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  list_id UUID NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  rss_feed_item_id UUID NOT NULL REFERENCES rss_feed_items (id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (uuid_extract_timestamp(id)) STORED,
  removed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_list_items__rss_feed_items__list_id__rss_feed_item_id
  ON list_items__rss_feed_items (list_id, rss_feed_item_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_list_items__rss_feed_items__rss_feed_item_id
  ON list_items__rss_feed_items (rss_feed_item_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_list_items__rss_feed_items__list_id__id
  ON list_items__rss_feed_items (list_id, id DESC)
  WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS list_items__posts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  list_id UUID NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (uuid_extract_timestamp(id)) STORED,
  removed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_list_items__posts__list_id__post_id
  ON list_items__posts (list_id, post_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_list_items__posts__post_id
  ON list_items__posts (post_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_list_items__posts__list_id__id
  ON list_items__posts (list_id, id DESC)
  WHERE removed_at IS NULL;

COMMENT ON TABLE lists IS 'User-curated named collections of RSS feed items and posts.';
COMMENT ON COLUMN lists.owner_user_id IS 'The user who owns and manages this list.';
COMMENT ON COLUMN lists.name IS 'Display name for the list (1–255 characters).';
COMMENT ON COLUMN lists.description IS 'Optional description of the list.';
COMMENT ON COLUMN lists.visibility IS 'Access level: private (owner only), unlisted (link access), or public (discoverable).';
COMMENT ON COLUMN lists.removed_at IS 'Soft-delete timestamp; NULL means the list is active.';

COMMENT ON TABLE list_items__rss_feed_items IS 'Junction table tracking RSS feed items added to lists.';
COMMENT ON COLUMN list_items__rss_feed_items.list_id IS 'The list this item belongs to.';
COMMENT ON COLUMN list_items__rss_feed_items.rss_feed_item_id IS 'The RSS feed item added to the list.';
COMMENT ON COLUMN list_items__rss_feed_items.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN list_items__rss_feed_items.removed_at IS 'Soft-delete timestamp; NULL means active. Re-adding after removal creates a new row.';

COMMENT ON TABLE list_items__posts IS 'Junction table tracking posts added to lists.';
COMMENT ON COLUMN list_items__posts.list_id IS 'The list this item belongs to.';
COMMENT ON COLUMN list_items__posts.post_id IS 'The post added to the list.';
COMMENT ON COLUMN list_items__posts.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN list_items__posts.removed_at IS 'Soft-delete timestamp; NULL means active. Re-adding after removal creates a new row.';

CREATE INDEX IF NOT EXISTS idx_lists__created_via_oauth_client_id
  ON lists (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;
