// Relocated to @modules/feed-query-builders (pure SQL-fragment builders, no service
// dependencies) so rss-feed-items can consume these without depending on @services/rss-feeds
// (avoids a workspace cycle). Re-exported here so existing consumers (backend/services/stories)
// keep working unchanged.
export {
  feedIsEnabledAndDiscoverableSql,
  itemHasDiscoverableSourceSql,
} from '@modules/feed-query-builders/discoverability-sql'
