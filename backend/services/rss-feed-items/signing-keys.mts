// Relocated to @modules/rss-feed-cover-art (used by both @services/rss-feeds and
// @services/rss-feed-items). Re-exported here so existing consumers (backend/api/v1/urls/crawl)
// keep working unchanged.
export { getSigningKeys } from '@modules/rss-feed-cover-art/signing-keys'
