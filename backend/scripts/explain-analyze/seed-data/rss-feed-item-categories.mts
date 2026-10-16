import { beginTransaction } from '@data-stores/psql'
import { SEED_PREFIX } from './common.mts'

export async function seedRssFeedItemCategories(count = 5000): Promise<void> {
  console.log(`Seeding ${count} RSS feed item categories...`)
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedExplainData categoryIdentities */
      INSERT INTO rss_category_identities (category_text)
      SELECT 'seed-category-' || series FROM generate_series(0, 199) AS series
      ON CONFLICT (category_text) DO UPDATE SET category_text = EXCLUDED.category_text`,
  )
  await transaction(
    `/* seedExplainData */ INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_identity_id, category_text, topic_id)
      SELECT seeded.id, identity.id, identity.category_text, topic.topic_id
      FROM ( SELECT id, (row_number() OVER (ORDER BY id) - 1)::int AS row_index
        FROM rss_feed_item_guids WHERE guid LIKE 'seed-item-guid-%' LIMIT $1 ) seeded
      JOIN rss_category_identities identity
        ON identity.category_text = 'seed-category-' || (seeded.row_index % 200)
      CROSS JOIN LATERAL ( SELECT ($2 || lpad(to_hex(seeded.row_index % 200), 12, '0'))::uuid AS topic_id ) topic
      ON CONFLICT DO NOTHING`,
    [count, `${SEED_PREFIX}-0400-7000-8000-`],
  )

  await transaction.commit()
}
