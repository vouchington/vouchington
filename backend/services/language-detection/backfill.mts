import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Number of IDs accumulated before a batch is yielded for bulk enqueue.
const BACKFILL_BATCH_SIZE = 500

async function* streamIdBatches(
  rows: AsyncIterable<{ id: string }>,
): AsyncGenerator<string[], void, unknown> {
  let batch: string[] = []
  for await (const row of rows) {
    batch.push(row.id)
    if (batch.length >= BACKFILL_BATCH_SIZE) {
      yield batch
      batch = []
    }
  }
  if (batch.length > 0) {
    yield batch
  }
}

/**
 * Streams post IDs eligible for language detection.
 * Idempotent: runBatch skips rows whose saved input key still matches current content.
 */
export function streamPostsNeedingLanguageDetection(): AsyncGenerator<string[], void, unknown> {
  return streamIdBatches(
    createAsyncGeneratorFromCursor<{ id: string }>(
      sql`/* streamPostsNeedingLanguageDetection */
        SELECT id FROM posts
        WHERE deleted_at IS NULL
        ORDER BY id
      `,
      { batchSize: BACKFILL_BATCH_SIZE },
    ),
  )
}

/**
 * Streams rss_feed_item IDs eligible for language detection.
 */
export function streamRssFeedItemsNeedingLanguageDetection(): AsyncGenerator<
  string[],
  void,
  unknown
> {
  return streamIdBatches(
    createAsyncGeneratorFromCursor<{ id: string }>(
      sql`/* streamRssFeedItemsNeedingLanguageDetection */
        SELECT id FROM rss_feed_items
        WHERE deleted_at IS NULL
        ORDER BY id
      `,
      { batchSize: BACKFILL_BATCH_SIZE },
    ),
  )
}

/**
 * Streams crawl IDs eligible for language detection.
 * Only selects completed crawls that have saved detector input — placeholder
 * rows created by createCrawl() have empty inputs and null completed_at.
 */
export function streamCrawlsNeedingLanguageDetection(): AsyncGenerator<string[], void, unknown> {
  return streamIdBatches(
    createAsyncGeneratorFromCursor<{ id: string }>(
      sql`/* streamCrawlsNeedingLanguageDetection */
        SELECT id FROM crawls
        WHERE completed_at IS NOT NULL
          AND (
            markdown != ''
            OR COALESCE(title, '') != ''
            OR COALESCE(lang, '') != ''
          )
        ORDER BY id
      `,
      { batchSize: BACKFILL_BATCH_SIZE },
    ),
  )
}

/**
 * Streams community IDs eligible for language detection.
 */
export function streamCommunitiesNeedingLanguageDetection(): AsyncGenerator<
  string[],
  void,
  unknown
> {
  return streamIdBatches(
    createAsyncGeneratorFromCursor<{ id: string }>(
      sql`/* streamCommunitiesNeedingLanguageDetection */
        SELECT id FROM communities
        WHERE deleted_at IS NULL
        ORDER BY id
      `,
      { batchSize: BACKFILL_BATCH_SIZE },
    ),
  )
}

/**
 * Streams user IDs eligible for language detection on their bio.
 * Only users with a non-empty bio are worth detecting.
 */
export function streamUsersNeedingLanguageDetection(): AsyncGenerator<string[], void, unknown> {
  return streamIdBatches(
    createAsyncGeneratorFromCursor<{ id: string }>(
      sql`/* streamUsersNeedingLanguageDetection */
        SELECT id FROM users
        WHERE markdown IS NOT NULL
          AND markdown != ''
          AND deleted_at IS NULL
        ORDER BY id
      `,
      { batchSize: BACKFILL_BATCH_SIZE },
    ),
  )
}

/**
 * Streams topic IDs eligible for language detection.
 */
export function streamTopicsNeedingLanguageDetection(): AsyncGenerator<string[], void, unknown> {
  return streamIdBatches(
    createAsyncGeneratorFromCursor<{ id: string }>(
      sql`/* streamTopicsNeedingLanguageDetection */
        SELECT id FROM topics
        WHERE deleted_at IS NULL
          AND merged_into_topic_id IS NULL
        ORDER BY id
      `,
      { batchSize: BACKFILL_BATCH_SIZE },
    ),
  )
}
