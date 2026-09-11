import type { TransactionQuery } from '@data-stores/psql'

/**
 * Seed unmapped RSS feed item categories for Playwright tests.
 * Looks up existing seeded RSS feed items and inserts unmapped categories.
 * Safe to re-seed: ON CONFLICT DO NOTHING.
 */
export async function seedPlaywrightRssFeedCategoryData(query: TransactionQuery): Promise<void> {
  // Get existing seeded RSS feed item IDs (created in feeds.mts)
  const { rows: itemRows } = await query<{ id: string }>(
    `SELECT id FROM rss_feed_item_ids WHERE guid IN ('doc-csp-bonus', 'tpg-csp-bonus', 'doc-amex-grocery', 'tpg-amex-grocery', 'doc-hilton-devalue')
    LIMIT 5`,
  )

  if (itemRows.length === 0) return

  // Insert unmapped categories for Playwright tests
  // Use ON CONFLICT DO NOTHING so re-seeding is safe
  await Promise.all(
    itemRows.map(row =>
      query(
        `INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_text, topic_id)
        VALUES ($1, 'credit-cards-pw-test', NULL), ($1, 'news-pw-test', NULL)
        ON CONFLICT DO NOTHING`,
        [row.id],
      ),
    ),
  )

  // Pre-reject 'news-pw-test' so the rejected-status view has a row for Playwright tests
  await query(
    `INSERT INTO rss_feed_item_category_rejections (category_text, created_by_id)
    VALUES ('news-pw-test', NULL)
    ON CONFLICT DO NOTHING`,
  )
}
