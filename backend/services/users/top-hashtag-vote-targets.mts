const TOP_HASHTAG_RELATION_TABLES = new Set([
  'relation__post__category__topic_alias',
  'relation__rss_feed_item__category__topic_alias',
])

export function hasTopHashtagVoteTarget(targets: Array<{ relationTable: string }>): boolean {
  return targets.some(target => TOP_HASHTAG_RELATION_TABLES.has(target.relationTable))
}
