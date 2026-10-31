import { getRssFeedsWorkLimit } from './work-limits.mts'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { chunkArray } from '@services/rss-feed-items/processing-limits'
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
