import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'
import { POST_URL_CAPACITY_SEED as seed } from '../seed-data/post-related-url-capacity.mts'

const PREFIX_ITEM_COUNT = 10_000
export const STORY_ID = seedUuid(1, 'f7')
export const HIGH_WATER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
export const ITEM_INDEX = 'idx_rss_feed_items__story_id__deleted_at__id'
export const PRUNE_INDEX = 'idx_relation__post__related__url__subject__projection_source'
export const DEFAULT_LEASE = seedUuid(2, 'f7')
export const MAXIMUM_LEASE = seedUuid(3, 'f7')

let previousItems: Array<{ id: string; story_id: string | null }> = []

export async function attachPrefixItems(): Promise<void> {
  await write(
    `/* prepareStoryPostUrlPrefix:story */
     INSERT INTO stories (id, title) VALUES ($1, 'EXPLAIN related URL prefix')
     ON CONFLICT (id) DO NOTHING`,
    [STORY_ID],
  )
  const { rows } = await write<{ id: string; story_id: string | null }>(
    `/* prepareStoryPostUrlPrefix:items */
     WITH chosen AS (
       SELECT id, story_id
       FROM rss_feed_items
       WHERE deleted_at IS NULL AND story_id IS DISTINCT FROM $1::uuid
       ORDER BY id
       LIMIT $2
     ), updated AS (
       UPDATE rss_feed_items items
       SET story_id = $1
       FROM chosen
       WHERE items.id = chosen.id
       RETURNING chosen.id, chosen.story_id
     )
     SELECT id, story_id FROM updated`,
    [STORY_ID, PREFIX_ITEM_COUNT],
  )
  previousItems = rows
  assert.equal(rows.length, PREFIX_ITEM_COUNT)
  await write(`/* prepareStoryPostUrlPrefix:analyze */ ANALYZE rss_feed_items`)
}

export async function leasePruneJobs(): Promise<void> {
  await write(
    `/* prepareStoryPostUrlPrefix:jobs */
     INSERT INTO story_post_related_url_projection_jobs
       (post_id, story_id, generation, lease_token, leased_at, lease_expires_at, last_claimed_at)
     VALUES
       ($1, $3, 1, $4, clock_timestamp(), clock_timestamp() + INTERVAL '1 day', clock_timestamp()),
       ($2, $3, 1, $5, clock_timestamp(), clock_timestamp() + INTERVAL '1 day', clock_timestamp())`,
    [seed.posts[0], seed.posts[1], STORY_ID, DEFAULT_LEASE, MAXIMUM_LEASE],
  )
}

export async function restorePrefixItems(): Promise<void> {
  if (previousItems.length > 0) {
    await write(
      `/* restoreStoryPostUrlPrefix:items */
       UPDATE rss_feed_items items
       SET story_id = input.story_id
       FROM unnest($1::uuid[], $2::uuid[]) AS input(id, story_id)
       WHERE items.id = input.id`,
      [previousItems.map(row => row.id), previousItems.map(row => row.story_id)],
    )
    previousItems = []
  }
  await write(`/* restoreStoryPostUrlPrefix:story */ DELETE FROM stories WHERE id = $1`, [STORY_ID])
}

export async function prefixUrlIds(cap: number): Promise<string[]> {
  const { rows } = await write<{ url_id: string }>(
    `/* storyPostUrlPrefixUrlIds */
     -- no-mistakes-disable-next-line postgres-required-predicates: story membership can attach already-created items, so item IDs may predate story_id
     SELECT url_id FROM rss_feed_items
     WHERE story_id = $1 AND deleted_at IS NULL AND id <= $2
     ORDER BY story_id, id
     LIMIT $3`,
    [STORY_ID, HIGH_WATER_ID, cap],
  )
  assert.equal(rows.length, cap)
  const urlIds: string[] = []
  for (const row of rows) urlIds.push(row.url_id)
  return urlIds
}

export async function activeUrlIds(postId: string): Promise<string[]> {
  const { rows } = await write<{ object_id: string }>(
    `/* storyPostUrlPrefixActiveUrls */
     SELECT object_id FROM relation__post__related__url
     WHERE subject_id = $1 AND deleted_at IS NULL AND created_by_id = $2
     ORDER BY object_id`,
    [postId, seed.user],
  )
  const urlIds: string[] = []
  for (const row of rows) urlIds.push(row.object_id)
  return urlIds
}

export async function partitionIndexNames(parent: string): Promise<string[]> {
  const { rows } = await write<{ index_name: string }>(
    `/* storyPostUrlPrefixIndexLeaves */
     SELECT index_class.relname AS index_name
     FROM pg_partition_tree($1::regclass) tree
     JOIN pg_class index_class ON index_class.oid = tree.relid
     WHERE tree.isleaf`,
    [parent],
  )
  if (rows.length === 0) throw new Error(`Missing index leaves for ${parent}`)
  const names = [parent]
  for (const row of rows) names.push(row.index_name)
  return names
}
