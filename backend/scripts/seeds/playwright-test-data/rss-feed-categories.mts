import type { TransactionQuery } from '@data-stores/psql'
import { registerRssCategoryIdentities } from '@services/rss-feed-items/category-identities'

/**
 * Seed unmapped RSS feed item categories for Playwright tests.
 * Looks up existing seeded RSS feed items and inserts unmapped categories.
 * Safe to re-seed: ON CONFLICT DO NOTHING.
 */
export async function seedPlaywrightRssFeedCategoryData(query: TransactionQuery): Promise<void> {
  // Get existing seeded RSS feed item IDs (created in feeds.mts)
  const { rows: itemRows } = await query<{ id: string }>(
    `/* seedPlaywrightRssFeedCategoryData */ SELECT id FROM rss_feed_item_guids WHERE guid IN ('doc-csp-bonus', 'tpg-csp-bonus', 'doc-amex-grocery', 'tpg-amex-grocery', 'doc-hilton-devalue')
    LIMIT 5`,
  )

  if (itemRows.length === 0) return

  await registerRssCategoryIdentities(['credit-cards-pw-test', 'news-pw-test'], query)

  // Insert unmapped categories for Playwright tests
  // Use ON CONFLICT DO NOTHING so re-seeding is safe
  await query(
    `/* seedPlaywrightRssFeedCategoryData */ INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_id, category_text, topic_id)
    SELECT item.id, identity.id, category.category_text, NULL
    FROM unnest($1::uuid[]) AS item(id)
    CROSS JOIN (VALUES ('credit-cards-pw-test'), ('news-pw-test')) AS category(category_text)
    JOIN rss_category_identities identity ON identity.category_text = category.category_text
    ON CONFLICT DO NOTHING`,
    [itemRows.map(row => row.id)],
  )

  // Pre-reject 'news-pw-test' so the rejected-status view has a row for Playwright tests
  await query(
    `/* seedPlaywrightRssFeedCategoryData */ INSERT INTO rss_feed_item_category_rejections (category_id, created_by_id)
    SELECT id, NULL FROM rss_category_identities WHERE category_text = 'news-pw-test'
    ON CONFLICT DO NOTHING`,
  )
}
