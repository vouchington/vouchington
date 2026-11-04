import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import {
  getHackerNewsWorkLimit,
  hackerNewsWorkConfig,
} from '@services/urls/hacker-news-work-limits'
import {
  HACKER_NEWS_COMMENT_CAP_PER_URL,
  HACKER_NEWS_STORY_CAP_PER_URL,
} from '@services/urls/hacker-news-references-types'
import { runBoundedBatches } from './run-bounded-batches.mts'

/** Refetchable facts expire by lookup time; deletion of URL identities never drives retention. */
export async function cleanupHackerNewsReferences(
  options: { now?: Date; query?: TransactionQuery } = {},
) {
  await hackerNewsWorkConfig.waitForInitialization()
  const cutoff = new Date(
    (options.now ?? new Date()).getTime() - getHackerNewsWorkLimit('retention_days') * 86_400_000,
  )
  return runBoundedBatches(
    {
      batchSize: getHackerNewsWorkLimit('retention_batch_size'),
      maxBatches: getHackerNewsWorkLimit('retention_max_batches'),
    },
    async batchSize => {
      if (options.query) {
        return withTransactionOptions({ query: options.query }, query =>
          cleanupHackerNewsReferenceBatch(query, cutoff, batchSize),
        )
      }
      await using query = await beginTransaction()
      const deleted = await cleanupHackerNewsReferenceBatch(query, cutoff, batchSize)
      await query.commit()
      return deleted
    },
  )
}

async function cleanupHackerNewsReferenceBatch(
  query: TransactionQuery,
  cutoff: Date,
  batchSize: number,
) {
  // This lock is also taken by the writer before touching children. A refresh that wins
  // first moves its row beyond the cutoff; one that waits recreates a complete fresh snapshot.
  const page = await query<{ url_id: string }>(
    `/* selectExpiredHackerNewsReferences */
      SELECT url_id FROM url_hacker_news_totals
      WHERE looked_up_at < $1
      ORDER BY looked_up_at, url_id LIMIT $2 FOR UPDATE SKIP LOCKED`,
    [cutoff, batchSize],
  )
  const ids = page.rows.map(row => row.url_id)
  if (ids.length === 0) return 0
  // ast-grep-ignore: no-three-sequential-awaits -- the locked snapshot is deleted on one transaction connection before its totals row is removed.
  await query(
    `/* deleteExpiredHackerNewsStories */
      WITH candidates AS (
        SELECT url_id, hacker_news_item_id FROM url_hacker_news_stories
        WHERE url_id = ANY($1::uuid[])
        ORDER BY url_id, hacker_news_item_id LIMIT $2
      )
      DELETE FROM url_hacker_news_stories AS stories USING candidates
      WHERE stories.url_id = candidates.url_id
        AND stories.hacker_news_item_id = candidates.hacker_news_item_id`,
    [ids, batchSize * HACKER_NEWS_STORY_CAP_PER_URL],
  )
  await query(
    `/* deleteExpiredHackerNewsComments */
      WITH candidates AS (
        SELECT url_id, hacker_news_item_id FROM url_hacker_news_comments
        WHERE url_id = ANY($1::uuid[])
        ORDER BY url_id, hacker_news_item_id LIMIT $2
      )
      DELETE FROM url_hacker_news_comments AS comments USING candidates
      WHERE comments.url_id = candidates.url_id
        AND comments.hacker_news_item_id = candidates.hacker_news_item_id`,
    [ids, batchSize * HACKER_NEWS_COMMENT_CAP_PER_URL],
  )
  await query(
    `/* deleteExpiredHackerNewsTotals */
      DELETE FROM url_hacker_news_totals WHERE url_id = ANY($1::uuid[])`,
    [ids],
  )
  // Deleted rows are the persisted progress: the next tick starts at the oldest survivor.
  return ids.length
}
