import { read, write, type QueryExecutor } from '@data-stores/psql'

/** Resolve a fixture's external category label to the current UUID identity. */
export async function registerTestRssCategoryIdentity(
  categoryText: string,
  query: QueryExecutor = write,
): Promise<string> {
  const normalized = categoryText.trim().toLowerCase()
  const { rows } = await query<{ id: string }>(
    `/* registerTestRssCategoryIdentity */
      INSERT INTO rss_category_identities (category_text)
      VALUES ($1)
      ON CONFLICT (category_text) DO UPDATE
      SET category_text = EXCLUDED.category_text
      RETURNING id`,
    [normalized],
  )
  return rows[0]!.id
}

/** Observe the four category relations for one test-owned feed and item. */
export async function getTestRssCategoryIdentityUsage(
  categoryText: string,
  rssFeedId: string,
  rssFeedItemId: string,
): Promise<{
  identity_id: string
  feed_category_identity_id: string | null
  item_category_identity_id: string | null
  authored_category_text: string | null
  rejection_category_identity_id: string | null
  count_category_identity_id: string | null
  item_count: number | null
} | null> {
  const { rows } = await read<{
    identity_id: string
    feed_category_identity_id: string | null
    item_category_identity_id: string | null
    authored_category_text: string | null
    rejection_category_identity_id: string | null
    count_category_identity_id: string | null
    item_count: number | null
  }>(
    `/* getTestRssCategoryIdentityUsage */
      SELECT identity.id AS identity_id,
        (SELECT category_identity_id FROM rss_feed_categories
         WHERE rss_feed_id = $2 AND category_identity_id = identity.id) AS feed_category_identity_id,
        (SELECT category_identity_id FROM rss_feed_item_categories
         WHERE rss_feed_item_id = $3 AND category_identity_id = identity.id) AS item_category_identity_id,
        (SELECT category_text FROM rss_feed_item_categories
         WHERE rss_feed_item_id = $3 AND category_identity_id = identity.id) AS authored_category_text,
        (SELECT category_identity_id FROM rss_feed_item_category_rejections
         WHERE category_identity_id = identity.id) AS rejection_category_identity_id,
        (SELECT category_identity_id FROM rss_feed_item_unmapped_category_counts
         WHERE category_identity_id = identity.id) AS count_category_identity_id,
        (SELECT item_count::int FROM rss_feed_item_unmapped_category_counts
         WHERE category_identity_id = identity.id) AS item_count
      FROM rss_category_identities identity
      WHERE identity.category_text = LOWER(TRIM($1))`,
    [categoryText, rssFeedId, rssFeedItemId],
  )
  return rows[0] ?? null
}
