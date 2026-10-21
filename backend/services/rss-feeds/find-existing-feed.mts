import { query } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

type FeedLookupResult = {
  id: string
  topic_id: string
  topic_slug: string
  resolved_feed_url: string
}

/**
 * Finds an existing RSS feed by URL ID; follows canonical_rss_feed_id one level.
 *
 * Dedup includes feeds attached to soft-deleted topics so recreating a feed cannot
 * bypass URL uniqueness. Topic merges repoint ownership to the active destination.
 */
export async function findExistingFeedByUrlId(
  rssFeedUrlId: string,
  options?: QueryOptions,
): Promise<FeedLookupResult | null> {
  const { rows } = await query(
    // no-mistakes-disable-next-line postgres-required-predicates: feed dedup intentionally spans inactive topic lifecycle states
    sql`/* findExistingFeedByUrlId */ SELECT COALESCE(canonical.id, rf.id) AS id, COALESCE(canonical.topic_id, rf.topic_id) AS topic_id, COALESCE(ct.slug, t.slug) AS topic_slug, COALESCE(canonical_url.url, source_url.url) AS resolved_feed_url FROM rss_feeds rf JOIN topics t ON t.id = rf.topic_id JOIN urls source_url ON source_url.id = rf.rss_feed_url_id LEFT JOIN rss_feeds canonical ON canonical.id = rf.canonical_rss_feed_id AND canonical.deleted_at IS NULL LEFT JOIN urls canonical_url ON canonical_url.id = canonical.rss_feed_url_id LEFT JOIN topics ct ON ct.id = canonical.topic_id WHERE rf.rss_feed_url_id = ${rssFeedUrlId} AND rf.deleted_at IS NULL LIMIT 1`,
    { ...options, readOnly: options?.readOnly ?? true },
  )
  return (rows[0] as FeedLookupResult | undefined) ?? null
}

/**
 * Finds an existing RSS feed by URL string without creating URL rows.
 *
 * Shares findExistingFeedByUrlId's dedup behavior for soft-deleted owners and
 * canonical destination ownership after topic merges.
 */
export async function findExistingFeedByUrl(
  url: string,
  options?: QueryOptions,
): Promise<FeedLookupResult | null> {
  const { rows } = await query(
    // no-mistakes-disable-next-line postgres-required-predicates: feed dedup intentionally spans inactive topic lifecycle states
    sql`/* findExistingFeedByUrl */ SELECT COALESCE(canonical.id, rf.id) AS id, COALESCE(canonical.topic_id, rf.topic_id) AS topic_id, COALESCE(ct.slug, t.slug) AS topic_slug, COALESCE(canonical_url.url, u.url) AS resolved_feed_url FROM rss_feeds rf JOIN urls u ON u.id = rf.rss_feed_url_id JOIN topics t ON t.id = rf.topic_id LEFT JOIN rss_feeds canonical ON canonical.id = rf.canonical_rss_feed_id AND canonical.deleted_at IS NULL LEFT JOIN urls canonical_url ON canonical_url.id = canonical.rss_feed_url_id LEFT JOIN topics ct ON ct.id = canonical.topic_id WHERE u.url = ${url} AND rf.deleted_at IS NULL LIMIT 1`,
    { ...options, readOnly: options?.readOnly ?? true },
  )
  return (rows[0] as FeedLookupResult | undefined) ?? null
}
