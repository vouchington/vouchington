import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT = 1_000
export const STORY_POST_RELATED_URL_PROJECTION_SEED = {
  storyId: seedUuid(200_000, '17'),
} as const

/** Seeds one high-cardinality story so the source-page plan must use its paging index. */
export async function seedStoryPostRelatedUrlProjection(): Promise<void> {
  console.log(
    `Seeding ${STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT.toLocaleString()} story URL projection items...`,
  )
  await using query = await beginTransaction()
  await query(
    `/* seedExplainData */ DELETE FROM rss_feed_item_ids
       WHERE id >= '019e0000-1800-7000-8000-000000000000'::uuid
         AND id < '019e0000-1801-7000-8000-000000000000'::uuid`,
  )
  await query(
    `/* seedExplainData */ INSERT INTO stories (id, title)
       VALUES ($1, 'EXPLAIN story URL projection') ON CONFLICT (id) DO NOTHING`,
    [STORY_POST_RELATED_URL_PROJECTION_SEED.storyId],
  )
  await query(
    `/* seedExplainData */ WITH projection_items AS (
         SELECT ids.id
         FROM rss_feed_item_ids ids
         WHERE ids.guid LIKE 'seed-item-guid-%'
         ORDER BY ids.id DESC
         LIMIT $1
       )
       UPDATE rss_feed_items items
       SET story_id = $2
       FROM projection_items
       WHERE items.id = projection_items.id
         AND items.story_id IS DISTINCT FROM $2::uuid`,
    [STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT, STORY_POST_RELATED_URL_PROJECTION_SEED.storyId],
  )
  await assertSeededStoryPostRelatedUrlProjectionCount(query)
  await query.commit()
}

async function assertSeededStoryPostRelatedUrlProjectionCount(
  query: TransactionQuery,
): Promise<void> {
  const { rows } = await query<{ count: string }>(
    `/* assertSeededStoryPostRelatedUrlProjectionCount */
      SELECT COUNT(*)::text AS count
      FROM rss_feed_items
      WHERE story_id = $1 AND deleted_at IS NULL`,
    [STORY_POST_RELATED_URL_PROJECTION_SEED.storyId],
  )
  const actualCount = Number(rows[0]?.count)
  if (actualCount !== STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT) {
    throw new Error(
      `story URL projection EXPLAIN seed expected ${STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT.toLocaleString()} active items, found ${actualCount.toLocaleString()}`,
    )
  }
}
