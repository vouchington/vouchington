import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT = 1_000
export const STORY_POST_RELATED_URL_PROJECTION_SEED = {
  storyId: seedUuid(200_000, '17'),
  feedSearchToken: 'rssstoryskewseed',
} as const

/** Seeds one high-cardinality story so the source-page plan must use its paging index. */
export async function seedStoryPostRelatedUrlProjection(): Promise<void> {
  console.log(
    `Seeding ${STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT.toLocaleString()} story URL projection items...`,
  )
  await using query = await beginTransaction()
  await query(
    `/* seedExplainData */ DELETE FROM rss_feed_item_guids
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
         FROM rss_feed_item_guids ids
         WHERE ids.guid LIKE 'seed-item-guid-%'
         ORDER BY ids.id DESC
         LIMIT $1
       )
       UPDATE rss_feed_items items
       SET story_id = $2,
           data = jsonb_set(items.data, '{title}', to_jsonb($3::text))
       FROM projection_items
       WHERE items.id = projection_items.id
         AND (items.story_id IS DISTINCT FROM $2::uuid OR items.data->>'title' IS DISTINCT FROM $3::text)`,
    [
      STORY_POST_RELATED_URL_PROJECTION_SEED_COUNT,
      STORY_POST_RELATED_URL_PROJECTION_SEED.storyId,
      `Seed Item ${STORY_POST_RELATED_URL_PROJECTION_SEED.feedSearchToken}`,
    ],
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

/** An isolated empty-snapshot cohort for the real global dispatcher, never shared Vitest data. */
export async function seedStoryProjectionDispatcherWitness() {
  await using query = await beginTransaction()
  const existing = await query(
    `/* storyProjectionDispatcherWitness */ SELECT 1 FROM story_post_related_url_projection_jobs LIMIT 1`,
  )
  if (existing.rows.length)
    throw new Error('Global story projection witness requires an empty jobs table')
  const { rows: stories } = await query<{ id: string }>(
    `/* storyProjectionDispatcherWitness */ INSERT INTO stories (title)
      VALUES ('Native empty projection witness') RETURNING id`,
  )
  const storyId = stories[0]!.id
  const { rows: posts } = await query<{ id: string }>(
    `/* storyProjectionDispatcherWitness */ INSERT INTO posts (created_via, post_type, title,
        bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
      SELECT 'system', 'story', 'Native empty projection witness',
        decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
      FROM generate_series(1, 3)
      RETURNING id`,
  )
  const postIds = posts.map(row => row.id).toSorted()
  await query(
    `/* storyProjectionDispatcherWitness */ INSERT INTO story_post_related_url_projection_jobs
      (post_id, story_id, lease_token, leased_at, lease_expires_at)
      SELECT id, $2::uuid,
        CASE WHEN id = $3::uuid THEN uuidv7() END,
        CASE WHEN id = $3::uuid THEN clock_timestamp() END,
        CASE WHEN id = $3::uuid THEN clock_timestamp() + INTERVAL '1 day' END
      FROM unnest($1::uuid[]) AS id`,
    [postIds, storyId, postIds[2]],
  )
  await query.commit()
  return { postIds, storyId }
}

export async function removeStoryProjectionDispatcherWitness(input: {
  postIds: string[]
  storyId: string
}): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* storyProjectionDispatcherWitness */ DELETE FROM posts WHERE id = ANY($1::uuid[])`,
    [input.postIds],
  )
  await query(`/* storyProjectionDispatcherWitness */ DELETE FROM stories WHERE id = $1`, [
    input.storyId,
  ])
  await query.commit()
}
