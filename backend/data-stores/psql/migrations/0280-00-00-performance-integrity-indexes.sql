-- Coalesced pre-launch domain baseline.
-- Merged from: 0420-00-00-postgres-performance-integrity.sql

CREATE INDEX IF NOT EXISTS idx_post_feed_shares__sharer__post__id_desc
  ON post_feed_shares (shared_by_user_id, post_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_rss_item_feed_shares__sharer__item__id_desc
  ON rss_feed_item_feed_shares (shared_by_user_id, rss_feed_item_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_crm_contacts__name__id
  ON crm_contacts (name, id);

CREATE INDEX IF NOT EXISTS idx_crm_contacts__name_trgm
  ON crm_contacts USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_crm_contacts__email_trgm
  ON crm_contacts USING GIN (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_support_contacts__email_address_trgm
  ON support_contacts USING GIN (email_address gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_support_contacts__name_trgm
  ON support_contacts USING GIN (name gin_trgm_ops);
