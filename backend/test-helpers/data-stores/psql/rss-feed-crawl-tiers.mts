import { read, write } from '@data-stores/psql'

export async function followRssFeed(followerIds: string[], feedId: string): Promise<void> {
  const values = followerIds.flatMap(id => [id, feedId])
  const placeholders = followerIds
    .map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`)
    .join(', ')
  await write(
    `/* followRssFeed */ INSERT INTO relation__user__follow__rss_feed (subject_id, object_id) VALUES ${placeholders}`,
    values,
  )
}

export async function getRssFeedCrawlScore(feedId: string): Promise<number | undefined> {
  const { rows } = await read<{ crawl_score: number }>(
    '/* getRssFeedCrawlScore */ SELECT crawl_score FROM mv_rss_feed_crawl_tiers WHERE rss_feed_id = $1',
    [feedId],
  )
  return rows[0]?.crawl_score
}

export async function getEnabledRssFeedCount(): Promise<number> {
  const { rows } = await read<{ count: number }>(
    '/* getEnabledRssFeedCount */ SELECT COUNT(*)::INT AS count FROM rss_feeds WHERE is_enabled = TRUE AND deleted_at IS NULL',
  )
  return rows[0]!.count
}

export async function getRssFeedCrawlTiers(feedIds: string[]): Promise<number[]> {
  const assignments = await getRssFeedCrawlTierAssignments(feedIds)
  return [...new Set(assignments.values())]
}

export async function getRssFeedCrawlTierAssignments(
  feedIds: string[],
): Promise<Map<string, number>> {
  const { rows } = await read<{ rss_feed_id: string; crawl_tier: number }>(
    '/* getRssFeedCrawlTierAssignments */ SELECT rss_feed_id, crawl_tier FROM mv_rss_feed_crawl_tiers WHERE rss_feed_id = ANY($1) ORDER BY crawl_tier',
    [feedIds],
  )
  return new Map(rows.map(row => [row.rss_feed_id, row.crawl_tier]))
}

export async function setCanonicalRssFeed(
  sourceFeedId: string,
  canonicalFeedId: string,
): Promise<void> {
  await write(
    '/* setCanonicalRssFeed */ UPDATE rss_feeds SET canonical_rss_feed_id = $1 WHERE id = $2',
    [canonicalFeedId, sourceFeedId],
  )
}
