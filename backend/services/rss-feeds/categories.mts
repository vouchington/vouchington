import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { chunkArray } from '@services/rss-feed-items/processing-limits'

export const RSS_FEED_CATEGORY_SQL_BATCH_SIZE = 500
const RSS_FEED_CATEGORY_BACKFILL_BATCH_SIZE = 500

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
 * Inserts missing (feed, category_text) pairs; resolves topic_id via alias/name/slug,
 * mirroring the item-level rss_feed_item_categories approach.
 */
export async function upsertRssFeedCategories(
  rssFeedId: string,
  rawCategories: string[],
): Promise<void> {
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
      DELETE FROM rss_feed_categories
      WHERE rss_feed_id = ${rssFeedId}
        AND category_text <> ALL (${normalized}::text[])
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

async function upsertRssFeedCategoriesChunk(
  rssFeedId: string,
  categories: string[],
): Promise<void> {
  await write(
    sql`/* upsertRssFeedCategories */
      INSERT INTO rss_feed_categories (
        rss_feed_id,
        category_text,
        topic_id
      )
      SELECT
        ${rssFeedId}::uuid AS rss_feed_id,
        input.category_text,
        COALESCE(t_alias.id, t_name.id, t_slug.id) AS topic_id
      FROM (
        SELECT unnest(${categories}::text[]) AS category_text
      ) AS input
      LEFT JOIN topic_aliases ta ON ta.alias = input.category_text
      LEFT JOIN topics t_alias
        ON t_alias.id = ta.topic_id
        AND t_alias.deleted_at IS NULL
        AND t_alias.merged_into_topic_id IS NULL
      LEFT JOIN topics t_name
        ON LOWER(t_name.name) = input.category_text
        AND t_name.deleted_at IS NULL
        AND t_name.merged_into_topic_id IS NULL
      LEFT JOIN topics t_slug
        ON t_slug.slug = input.category_text
        AND t_slug.deleted_at IS NULL
        AND t_slug.merged_into_topic_id IS NULL
      ORDER BY rss_feed_id ASC NULLS LAST, input.category_text ASC NULLS LAST
      ON CONFLICT (rss_feed_id, category_text) DO UPDATE
        SET topic_id = EXCLUDED.topic_id,
            updated_at = CURRENT_TIMESTAMP
    `,
  )
}

/**
 * Backfills topic_id for existing rss_feed_categories rows when a topic alias
 * is added or a topic name/slug changes.
 */
export async function backfillCategoriesForTopicAlias(topicId: string): Promise<number> {
  let updated = 0

  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each write selects the next rows left by the preceding bounded backfill batch
    const { rowCount } = await write(
      sql`/* backfillCategoriesForTopicAlias */
        WITH candidates AS (
          SELECT rss_feed_id, category_text
          FROM rss_feed_categories
          WHERE
            (
              LOWER(category_text) IN (SELECT alias FROM topic_aliases WHERE topic_id = ${topicId})
              AND (topic_id IS NULL OR topic_id != ${topicId})
            )
            OR (
              topic_id IS NULL
              AND LOWER(category_text) = (
                SELECT LOWER(name) FROM topics
                WHERE id = ${topicId}
                  AND deleted_at IS NULL
                  AND merged_into_topic_id IS NULL
              )
            )
            OR (
              topic_id IS NULL
              AND LOWER(category_text) = (
                SELECT slug FROM topics
                WHERE id = ${topicId}
                  AND deleted_at IS NULL
                  AND merged_into_topic_id IS NULL
              )
            )
          ORDER BY rss_feed_id, category_text
          LIMIT ${RSS_FEED_CATEGORY_BACKFILL_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE rss_feed_categories target
        SET topic_id = ${topicId},
            updated_at = CURRENT_TIMESTAMP
        FROM candidates
        WHERE target.rss_feed_id = candidates.rss_feed_id
          AND target.category_text = candidates.category_text
      `,
    )
    const batchUpdated = rowCount ?? 0
    updated += batchUpdated
    if (batchUpdated === 0) break
  }
  return updated
}

/**
 * Returns all categories for an RSS feed, including their mapped topic IDs.
 */
export async function getRssFeedCategories(
  rssFeedId: string,
): Promise<Array<{ category_text: string; topic_id: string | null }>> {
  const { rows } = await read(
    sql`/* getRssFeedCategories */
      SELECT category_text, topic_id
      FROM rss_feed_categories
      WHERE rss_feed_id = ${rssFeedId}
      ORDER BY category_text
    `,
  )
  return rows as Array<{ category_text: string; topic_id: string | null }>
}
