import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'
import { POST_URL_CAPACITY_SEED as seed } from '../seed-data/post-related-url-capacity.mts'

// The maximum cap has to stay a prefix of this story. When LIMIT equals every
// story row, the planner sorts a sequential scan instead of stopping on
// idx_rss_feed_items__story_id__deleted_at__id. Insert these rows. Rewriting
// seeded rss_feed_items changes published_at correlation, and the later
// topic-metrics plan then reads every live item.
const EXTRA_ITEM_COUNT = 30_000
const EXTRA_ITEM_BATCH = 5_000
const EXTRA_ITEM_ID_PREFIX = '019f0000-f800-7000-8000-'
export const STORY_ID = seedUuid(1, 'f7')
export const HIGH_WATER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
export const ITEM_INDEX = 'idx_rss_feed_items__story_id__deleted_at__id'
export const PRUNE_INDEX = 'idx_relation__post__related__url__subject__projection_source'
export const NEWEST_INDEX = 'idx_relation__post__related__url__subject__newest'
export const DEFAULT_LEASE = seedUuid(2, 'f7')
export const MAXIMUM_LEASE = seedUuid(3, 'f7')

export async function attachPrefixItems(): Promise<void> {
  await write(
    `/* prepareStoryPostUrlPrefix:story */
     INSERT INTO stories (id, title) VALUES ($1, 'EXPLAIN related URL prefix')
     ON CONFLICT (id) DO NOTHING`,
    [STORY_ID],
  )
  await insertExtraPrefixItems()
  await write(`/* prepareStoryPostUrlPrefix:analyze */ ANALYZE rss_feed_items`)
}

async function insertExtraPrefixItems(): Promise<void> {
  const { rows } = await write<{ url_id: string; hostname_id: string }>(
    `/* prepareStoryPostUrlPrefix:extra-anchor */
     SELECT id AS url_id, hostname_id
     FROM urls
     WHERE hostname_id IS NOT NULL
     ORDER BY id
     LIMIT 1`,
  )
  const anchor = rows[0]
  assert.ok(anchor)
  for (let start = 0; start < EXTRA_ITEM_COUNT; start += EXTRA_ITEM_BATCH) {
    const end = Math.min(start + EXTRA_ITEM_BATCH, EXTRA_ITEM_COUNT) - 1
    // no-mistakes-disable-next-line query-reached-per-item: six fixed 5,000-row batches keep the maximum cap a prefix of this story
    await write(
      `/* prepareStoryPostUrlPrefix:extra-items */
       WITH ids AS (
         SELECT ($1 || lpad(to_hex(n), 12, '0'))::uuid AS id,
                'explain-prefix-extra-' || n::text AS guid
         FROM generate_series($2::int, $3::int) AS n
       ), inserted AS (
         INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
         SELECT id, $4, guid FROM ids
         RETURNING id
       )
       INSERT INTO rss_feed_items (
         id, url_id, data, bedrock_nova_multimodal_v1_content_sha256, story_id
       )
       SELECT inserted.id, $5, '{"title":"EXPLAIN prefix extra"}'::jsonb,
              decode(repeat('00', 32), 'hex'), $6
       FROM inserted`,
      [EXTRA_ITEM_ID_PREFIX, start, end, anchor.hostname_id, anchor.url_id, STORY_ID],
    )
  }
  const { rows: counts } = await write<{ count: number }>(
    `/* prepareStoryPostUrlPrefix:story-count */
     SELECT count(*)::int AS count
     FROM rss_feed_items
     WHERE story_id = $1 AND deleted_at IS NULL`,
    [STORY_ID],
  )
  assert.equal(counts[0]?.count, EXTRA_ITEM_COUNT)
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
  await removeExtraPrefixItems()
  await write(`/* restoreStoryPostUrlPrefix:story */ DELETE FROM stories WHERE id = $1`, [STORY_ID])
  // Inserts append past the seed heap. Vacuum drops those dead tuples so later plans see the
  // seeded rss_feed_items table and its published_at correlation.
  await write(`/* restoreStoryPostUrlPrefix:analyze */ VACUUM (ANALYZE) rss_feed_items`)
}

async function removeExtraPrefixItems(): Promise<void> {
  for (let start = 0; start < EXTRA_ITEM_COUNT; start += EXTRA_ITEM_BATCH) {
    const end = Math.min(start + EXTRA_ITEM_BATCH, EXTRA_ITEM_COUNT) - 1
    // no-mistakes-disable-next-line query-reached-per-item: six fixed 5,000-row deletes remove only this scenario's extra prefix rows
    await write(
      `/* restoreStoryPostUrlPrefix:extra-items */
       DELETE FROM rss_feed_item_guids
       WHERE id IN (
         SELECT ($1 || lpad(to_hex(n), 12, '0'))::uuid
         FROM generate_series($2::int, $3::int) AS n
       )`,
      [EXTRA_ITEM_ID_PREFIX, start, end],
    )
  }
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
