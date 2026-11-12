import { write } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'

export const CATEGORY_PROJECTION_NOISE_ROWS = 1000
export const CATEGORY_PROJECTION_TEXT = 'seed-completed-category-projection'

/** Seed only after ordinary captures: these pending rows belong to this point-write fixture. */
export async function seedCategoryProjection(): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* seedCategoryProjection:item */ SELECT id FROM rss_feed_item_guids
      WHERE url_hostname_id = $1::uuid AND guid = 'seed-item-guid-0'`,
    [seedUuid(0, '02')],
  )
  const itemId = rows[0]?.id
  if (!itemId) throw new Error('Category projection fixture needs the ordinary RSS item seed')
  // A feed with a long history must not turn this point lookup into a feed-wide scan.
  await write(
    `/* seedCategoryProjection:feedHistory */
      WITH identities AS (
        INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
        SELECT $1::uuid, 'seed-category-projection-history-' || ordinal
        FROM generate_series(1, $2::int) ordinal
        ON CONFLICT (url_hostname_id, guid) DO UPDATE SET guid = EXCLUDED.guid
        RETURNING id
      ), items AS (
        INSERT INTO rss_feed_items (id, url_id, data, gemini_embedding_2_content_sha256)
        SELECT id, $3::uuid, '{}'::jsonb, $4::bytea FROM identities
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
        RETURNING id
      )
      INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id)
      SELECT $5::uuid, id FROM items ON CONFLICT DO NOTHING`,
    [
      seedUuid(0, '02'),
      CATEGORY_PROJECTION_NOISE_ROWS,
      seedUuid(2500, '03'),
      contentHash('seed-category-projection-history'),
      seedUuid(0, '08'),
    ],
  )
  await write(
    `/* seedCategoryProjection:results */
      INSERT INTO rss_feed_item_category_projection_results
        (rss_feed_item_id, change_id, categories, completed_at)
      SELECT id, uuidv7(), '[]'::jsonb, CURRENT_TIMESTAMP FROM rss_feed_item_guids
      WHERE guid LIKE 'seed-item-guid-%' ORDER BY id LIMIT $1
      ON CONFLICT (rss_feed_item_id) DO NOTHING`,
    [CATEGORY_PROJECTION_NOISE_ROWS],
  )
  await write(
    `/* seedCategoryProjection:pending */
      INSERT INTO rss_feed_item_category_snapshot_reconciliations (rss_feed_item_id, categories)
      SELECT id, '[]'::jsonb FROM rss_feed_item_guids
      WHERE guid LIKE 'seed-item-guid-%' ORDER BY id LIMIT $1
      ON CONFLICT (rss_feed_item_id) DO NOTHING`,
    [CATEGORY_PROJECTION_NOISE_ROWS],
  )
  await write(
    `/* seedCategoryProjection:sources */
      INSERT INTO rss_feed_item_source_category_snapshots (rss_feed_id, rss_feed_item_id, categories)
      SELECT source.rss_feed_id, source.rss_feed_item_id, '[]'::jsonb
      FROM rss_feed_item_sources source
      JOIN rss_feed_item_guids identity ON identity.id = source.rss_feed_item_id
      WHERE identity.guid LIKE 'seed-item-guid-%'
      ORDER BY source.rss_feed_id, source.rss_feed_item_id LIMIT $1
      ON CONFLICT (rss_feed_id, rss_feed_item_id) DO NOTHING`,
    [CATEGORY_PROJECTION_NOISE_ROWS],
  )
  await write(
    `/* seedCategoryProjection:selectedSource */
      INSERT INTO rss_feed_item_source_category_snapshots (rss_feed_id, rss_feed_item_id, categories)
      VALUES ($1::uuid, $2::uuid, $3::jsonb)
      ON CONFLICT (rss_feed_id, rss_feed_item_id) DO UPDATE SET categories = EXCLUDED.categories`,
    [seedUuid(0, '08'), itemId, JSON.stringify([CATEGORY_PROJECTION_TEXT])],
  )
  await write(`/* seedCategoryProjection:vacuum */ VACUUM (ANALYZE)
    rss_feed_item_category_projection_results,
    rss_feed_item_category_snapshot_reconciliations,
    rss_feed_item_source_category_snapshots,
    rss_feed_item_sources,
    rss_feeds`)
  return itemId
}

/** Restore exact captured identity so independent EXPLAIN replays touch a real pending row. */
export async function prepareCategoryProjection(
  itemId: string,
  changeId: string,
  resultState: 'insert' | 'replace' | 'completed',
): Promise<void> {
  await write(
    `/* prepareCategoryProjection:pending */
      INSERT INTO rss_feed_item_category_snapshot_reconciliations
        (rss_feed_item_id, categories, generation, change_id)
      VALUES ($1::uuid, $2::jsonb, 1, $3::uuid)
      ON CONFLICT (rss_feed_item_id) DO UPDATE
      SET categories = EXCLUDED.categories, generation = 1, change_id = EXCLUDED.change_id`,
    [itemId, JSON.stringify([CATEGORY_PROJECTION_TEXT]), changeId],
  )
  if (resultState === 'insert') {
    await write(
      `/* prepareCategoryProjection:absent */ DELETE FROM rss_feed_item_category_projection_results
        WHERE rss_feed_item_id = $1::uuid`,
      [itemId],
    )
  } else if (resultState === 'replace') {
    await write(
      `/* prepareCategoryProjection:older */ UPDATE rss_feed_item_category_projection_results
        SET change_id = uuidv7() WHERE rss_feed_item_id = $1::uuid`,
      [itemId],
    )
  }
}
