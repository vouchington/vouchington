import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { POST_URL_CAPACITY_SEED } from './post-related-url-capacity.mts'

const TERMINAL_PROJECTION_CAPACITY = 1000

export async function seedProjectionCapacityTerminalJobs(): Promise<{
  storyId: string
  postIds: string[]
}> {
  await using query = await beginTransaction()
  const existingJobs = await query(
    `/* seedProjectionCapacityTerminalJobs:assertEmpty */
      SELECT 1 FROM story_post_related_url_projection_jobs LIMIT 1`,
  )
  if (existingJobs.rows.length > 0)
    throw new Error('Projection capacity terminal seed requires an empty jobs table')

  const { rows: stories } = await query<{ id: string }>(
    `/* seedProjectionCapacityTerminalJobs:story */
      INSERT INTO stories (title) VALUES ('EXPLAIN terminal projection capacity') RETURNING id`,
  )
  const storyId = stories[0]!.id
  const postIds = POST_URL_CAPACITY_SEED.posts
  const { rows: jobs } = await query<{ post_id: string }>(
    `/* seedProjectionCapacityTerminalJobs:jobs */
      INSERT INTO story_post_related_url_projection_jobs
        (post_id, story_id, generation, sweep_upper_bound_source_id,
         sweep_upper_bound_relation_id, relation_snapshot_at, limit_reached_capacity)
      SELECT input.post_id, $1, 1, NULL, NULL, clock_timestamp(), $3
      FROM unnest($2::uuid[]) AS input(post_id)
      ORDER BY input.post_id
      RETURNING post_id`,
    [storyId, postIds, TERMINAL_PROJECTION_CAPACITY],
  )
  assert.equal(jobs.length, postIds.length)
  await query.commit()
  await write(
    `/* seedProjectionCapacityTerminalJobs:analyze */
      ANALYZE story_post_related_url_projection_jobs`,
  )
  return { storyId, postIds: jobs.map(job => job.post_id).toSorted() }
}

export async function cleanupProjectionCapacityTerminalJobs(storyId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* cleanupProjectionCapacityTerminalJobs:jobs */
      DELETE FROM story_post_related_url_projection_jobs WHERE story_id = $1`,
    [storyId],
  )
  const { rows } = await query<{ count: number }>(
    `/* cleanupProjectionCapacityTerminalJobs:assertEmpty */
      SELECT count(*)::integer AS count
      FROM story_post_related_url_projection_jobs WHERE story_id = $1`,
    [storyId],
  )
  assert.equal(rows[0]?.count, 0)
  await query(
    `/* cleanupProjectionCapacityTerminalJobs:story */ DELETE FROM stories WHERE id = $1`,
    [storyId],
  )
  await query.commit()
}
