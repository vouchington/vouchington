CREATE INDEX IF NOT EXISTS idx_users__updated_at_id_active
ON users (updated_at, (id::text)) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_topics__updated_at_id_active
ON topics (updated_at, (id::text)) WHERE deleted_at IS NULL AND merged_into_topic_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_images__updated_at_id_active
ON images (updated_at, (id::text)) WHERE deleted_at IS NULL AND upload_completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_urls__updated_at_id_active
ON urls (updated_at, (id::text));

-- Bloom repair reads only the existing reconciliation window; old rows stay outside each range.
CREATE INDEX IF NOT EXISTS idx_communities__updated_at_id_active
ON communities (updated_at, (id::text)) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rss_feed_items__updated_at_id_active
ON rss_feed_items (updated_at, (id::text)) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys__updated_at_id_active
ON api_keys (updated_at, (id::text)) INCLUDE (key_hash) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_blocklisted_domains__updated_at_domain_source_id
ON blocklisted_domains (updated_at, domain, (source_id::text));

CREATE INDEX IF NOT EXISTS idx_bedrock_nova_multimodal_v1_embeddings__updated_at_hash
ON bedrock_nova_multimodal_v1_embeddings (updated_at, encode(content_sha256, 'hex'));

CREATE INDEX IF NOT EXISTS idx_bedrock_nova_multimodal_v1_embeddings__retention
ON bedrock_nova_multimodal_v1_embeddings (updated_at, content_sha256);

CREATE INDEX IF NOT EXISTS idx_post_slugs__updated_at_post_id_slug
ON post_slugs (updated_at, (post_id::text), slug);

CREATE INDEX IF NOT EXISTS idx_topic_aliases__updated_at_id
ON topic_aliases (updated_at, (id::text));

CREATE INDEX IF NOT EXISTS idx_url_hostnames__updated_at_id_blocked
ON url_hostnames (updated_at, (id::text)) WHERE is_blocked;

CREATE INDEX IF NOT EXISTS idx_url_hostnames__updated_at_id_not_crawlable
ON url_hostnames (updated_at, (id::text)) WHERE NOT is_crawlable AND NOT is_blocked;
