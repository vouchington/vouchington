import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  getHackerNewsWorkLimit,
  hackerNewsWorkConfig,
} from '@services/urls/hacker-news-work-limits'

/** Recompute persisted reference flags from live canonical URL facts. */
export async function recomputeRssFeedItemHackerNewsFlags(
  itemIds: readonly string[],
  options: QueryOptions = {},
): Promise<void> {
  if (itemIds.length === 0) return
  await hackerNewsWorkConfig.waitForInitialization()
  const ids = [...new Set(itemIds)].toSorted()
  const size = getHackerNewsWorkLimit('write_batch_size')
  for (let index = 0; index < ids.length; index += size) {
    const batch = ids.slice(index, index + size)
    // no-mistakes-disable-next-line query-reached-per-item: each transaction handles a bounded batch, not an individual item.
    await recomputeRssHackerNewsFlagChunk(batch, options) // oxlint-disable-line no-await-in-loop -- serialize bounded chunks and their locks.
  }
}

async function recomputeRssHackerNewsFlagChunk(
  ids: string[],
  options: QueryOptions,
): Promise<void> {
  if (options.query || options.client) {
    await withTransactionOptions(options, query => recomputeLockedRssHackerNewsFlags(query, ids))
    return
  }
  await using query = await beginTransaction()
  await recomputeLockedRssHackerNewsFlags(query, ids)
  await query.commit()
}

async function recomputeLockedRssHackerNewsFlags(
  query: TransactionQuery,
  ids: string[],
): Promise<void> {
  // Upserts lock these rows before changing URLs; recompute after acquiring the same locks.
  await query(
    `/* lockRssHackerNewsFlagItems */ SELECT id FROM rss_feed_items WHERE id = ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE`,
    [ids],
  )
  await query(
    `/* recomputeRssFeedItemHackerNewsFlags */
      UPDATE rss_feed_items item SET has_hacker_news_references = desired.has_references
      FROM (
        SELECT candidate.id, EXISTS (
          SELECT 1 FROM urls source
          JOIN url_hacker_news_totals totals
            ON totals.url_id = COALESCE(source.canonical_url_id, source.id)
          WHERE source.id = candidate.url_id AND (totals.story_count > 0 OR totals.comment_count > 0)
        ) AS has_references
        FROM rss_feed_items candidate WHERE candidate.id = ANY($1::uuid[])
      ) desired
      WHERE item.id = desired.id AND item.id = ANY($1::uuid[])
        AND item.has_hacker_news_references IS DISTINCT FROM desired.has_references`,
    [ids],
  )
}
