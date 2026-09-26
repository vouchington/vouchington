-- migration-mode: online
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_slugs__post_id_slug ON post_slugs (post_id, slug);
