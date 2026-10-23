import { write } from '@data-stores/psql'

/** Durable dirty queues and source snapshots for the two category reconcilers. */
export async function seedCategorySelection3511(): Promise<void> {
  console.log('Seeding category reconciliation source and dirty rows...')
  await write(`/* seedCategorySelection3511:aliases */
    INSERT INTO topic_alias_category_mapping_reconciliations (topic_alias_id, alias)
    SELECT ('019e0000-ad00-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      'explain-alias-' || ordinal
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
  await write(`/* seedCategorySelection3511:snapshots */
    INSERT INTO rss_feed_item_source_category_snapshots
      (rss_feed_id, rss_feed_item_id, categories)
    SELECT source.rss_feed_id, source.rss_feed_item_id,
      jsonb_build_array('explain-category-' || ordinal)
    FROM (
      SELECT rss_feed_id, rss_feed_item_id,
        row_number() OVER (ORDER BY rss_feed_item_id, rss_feed_id) AS ordinal
      FROM rss_feed_item_sources ORDER BY rss_feed_item_id, rss_feed_id LIMIT 10000
    ) source ON CONFLICT DO NOTHING`)
  await write(`/* seedCategorySelection3511:itemDirty */
    INSERT INTO rss_feed_item_category_snapshot_reconciliations
      (rss_feed_item_id, categories)
    SELECT rss_feed_item_id, '[]'::jsonb
    FROM (
      SELECT DISTINCT rss_feed_item_id
      FROM rss_feed_item_source_category_snapshots
      ORDER BY rss_feed_item_id LIMIT 10000
    ) source ON CONFLICT DO NOTHING`)
}
