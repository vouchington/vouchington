import { getRssFeedsWorkLimit } from './work-limits.mts'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { chunkArray } from '@services/rss-feed-items/processing-limits'
import { withTopicReferenceAttachmentFences } from '@services/post-publication/lock'
import { upsertRssFeedCategoriesChunk } from './category-upsert-chunk.mts'

/**
 * Normalizes an array of raw itunes:category texts for storage.
 * Trims whitespace, lowercases, deduplicates, and filters empty strings.
 */
function normalizeFeedCategories(categories: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const category of categories) {
    const normalized = category.trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

/**
 * Upserts feed-level Apple itunes:category rows for an RSS feed (podcast show).
 * Inserts missing (feed, category identity) pairs; resolves topic_id via alias/name/slug,
 * mirroring the item-level rss_feed_item_categories approach.
 */
export async function upsertRssFeedCategories(
  rssFeedId: string,
  rawCategories: string[],
): Promise<void> {
  const RSS_FEED_CATEGORY_SQL_BATCH_SIZE = getRssFeedsWorkLimit('category_sql_batch_size')
  if (rawCategories.length === 0) return

  const normalized = normalizeFeedCategories(rawCategories)
  if (normalized.length === 0) return

  for (const chunk of chunkArray(normalized, RSS_FEED_CATEGORY_SQL_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- category chunks commit sequentially to avoid lock contention on this feed
    await upsertRssFeedCategoriesChunk(rssFeedId, chunk)
  }

  // Remove categories the publisher dropped between crawls.
  await write(
    sql`/* upsertRssFeedCategories:deleteRemoved */
      DELETE FROM rss_feed_categories category
      WHERE category.rss_feed_id = ${rssFeedId}
        AND NOT EXISTS (
          SELECT 1 FROM rss_category_identities identity
          WHERE identity.id = category.category_identity_id
            AND identity.category_text = ANY (${normalized}::text[])
        )
    `,
  )
}

/**
 * Deletes all feed-level categories for an RSS feed.
 * Called when a feed's iTunes metadata disappears so stale category rows don't linger.
 */
export async function deleteRssFeedCategories(rssFeedId: string): Promise<void> {
  await write(
    sql`/* deleteRssFeedCategories */
      DELETE FROM rss_feed_categories WHERE rss_feed_id = ${rssFeedId}
    `,
  )
}

/**
 * Backfills topic_id for existing rss_feed_categories rows when a topic alias
 * is added or a topic name/slug changes.
 */
export async function backfillCategoriesForTopicAlias(
  topicId: string,
): Promise<{ updated: number; hasMore: boolean }> {
  const RSS_FEED_CATEGORY_BACKFILL_BATCH_SIZE = getRssFeedsWorkLimit('category_backfill_batch_size')
  const { rows: priorMappings } = await read<{
    topic_id: string | null
  }>(sql`/* backfillCategoriesForTopicAlias:priorMappings */
    SELECT category.topic_id
    FROM rss_feed_categories category
    JOIN rss_category_identities identity ON identity.id = category.category_identity_id
    WHERE identity.category_text IN (SELECT alias FROM topic_aliases WHERE topic_id = ${topicId})
      AND category.topic_id IS DISTINCT FROM ${topicId}::uuid
    ORDER BY category.rss_feed_id, category.category_identity_id
    LIMIT ${RSS_FEED_CATEGORY_BACKFILL_BATCH_SIZE}
  `)
  const lockedOldIds = [
    ...new Set(priorMappings.flatMap(row => (row.topic_id ? [row.topic_id] : []))),
  ]
  const { rowCount } = await withTopicReferenceAttachmentFences(
    [topicId, ...lockedOldIds],
    {},
    query =>
      write(
        sql`/* backfillCategoriesForTopicAlias */
        WITH candidates AS (
          SELECT category.rss_feed_id, category.category_identity_id
          FROM rss_feed_categories category
          JOIN rss_category_identities identity
            ON identity.id = category.category_identity_id
          WHERE
            (category.topic_id IS NULL OR category.topic_id = ANY(${lockedOldIds}::uuid[]))
            AND (
            (
              identity.category_text IN (SELECT alias FROM topic_aliases WHERE topic_id = ${topicId})
              AND (category.topic_id IS NULL OR category.topic_id != ${topicId})
            )
            OR (
              category.topic_id IS NULL
              AND identity.category_text = (
                SELECT LOWER(name) FROM topics
                WHERE id = ${topicId}
                  AND deleted_at IS NULL
                  AND merged_into_topic_id IS NULL
              )
            )
            OR (
              category.topic_id IS NULL
              AND identity.category_text = (
                SELECT slug FROM topics
                WHERE id = ${topicId}
                  AND deleted_at IS NULL
                  AND merged_into_topic_id IS NULL
              )
            )
            )
          ORDER BY category.rss_feed_id, category.category_identity_id
          LIMIT ${RSS_FEED_CATEGORY_BACKFILL_BATCH_SIZE}
          FOR UPDATE OF category
        )
        UPDATE rss_feed_categories target
        SET topic_id = ${topicId}
        FROM candidates
        WHERE target.rss_feed_id = candidates.rss_feed_id
          AND target.category_identity_id = candidates.category_identity_id
      `,
        { query },
      ),
  )
  const batchUpdated = rowCount ?? 0
  return { updated: batchUpdated, hasMore: batchUpdated === RSS_FEED_CATEGORY_BACKFILL_BATCH_SIZE }
}

/**
 * Returns all categories for an RSS feed, including their mapped topic IDs.
 */
export async function getRssFeedCategories(
  rssFeedId: string,
): Promise<Array<{ category_text: string; topic_id: string | null }>> {
  const { rows } = await read(
    sql`/* getRssFeedCategories */
      SELECT identity.category_text, category.topic_id
      FROM rss_feed_categories category
      JOIN rss_category_identities identity ON identity.id = category.category_identity_id
      WHERE category.rss_feed_id = ${rssFeedId}
      ORDER BY identity.category_text
    `,
  )
  return rows as Array<{ category_text: string; topic_id: string | null }>
}
