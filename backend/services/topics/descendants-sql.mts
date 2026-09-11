// Relocated to @voucha/types (pure SQL-fragment builder, no service dependencies) so that
// backend/services/urls-hostnames can build topic-descendant CTEs without creating a
// urls-hostnames -> topics workspace cycle. Re-exported here for call-site stability
// (backend/services/rss-feeds/search.mts is another external caller of this path).
export { appendTopicDescendantsCte } from '@voucha/types/entities/topic-descendants'
