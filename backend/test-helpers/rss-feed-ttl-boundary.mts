import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getRssFeedByIdToFetch, type RssFeedToFetch } from '../services/rss-feeds/get-to-fetch.mts'

/** Reads an owned feed against the same PostgreSQL transaction timestamp used for its TTL. */
export async function readTestRssFeedAtTtlOffset(
  feedId: string,
  ttlMs: number,
  offsetMs: number,
): Promise<RssFeedToFetch | null> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* readTestRssFeedAtTtlOffset */
    UPDATE rss_feeds
    SET last_fetched_at = CURRENT_TIMESTAMP -
      (${ttlMs}::bigint - ${offsetMs}::bigint) * INTERVAL '1 millisecond'
    WHERE id = ${feedId}
  `)
  return await getRssFeedByIdToFetch(feedId, { ttl: ttlMs, query: transaction })
}
