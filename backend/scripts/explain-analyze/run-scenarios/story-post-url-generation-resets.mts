import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { markStoryPostRelatedUrlProjection } from '@services/stories/story-post-related-url-projection-work'
import { markStoryPostRelatedUrlProjectionsForStories } from '@services/rss-feed-items/story-post-related-url-projections'
import type { ProjectionWork } from '@services/stories/story-post-related-url-projection-types'
import { POST_URL_CAPACITY_SEED as seed } from '../seed-data/post-related-url-capacity.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function captureGenerationReset(work: ProjectionWork): Promise<void> {
  const id = 'post-url-replacement-generation-reset'
  registerScenarioContract(id, {
    allowEmptyResult: true, // The live conflict-path assertion below verifies the reset.
    seededRows: { story_post_related_url_projection_jobs: seed.posts.length },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_jobs', max: 1 },
    ],
  })
  await runAndCapture(
    id,
    async () => {
      await using query = await beginTransaction()
      await markStoryPostRelatedUrlProjection(query, work.post_id, work.story_id)
      const { rows } = await query<{ generation: string; eligibility_completed_at: Date | null }>(
        `/* verifyStoryPostUrlReplacementReset */ SELECT generation, eligibility_completed_at
        FROM story_post_related_url_projection_jobs WHERE post_id = $1 LIMIT 1`,
        [work.post_id],
      )
      assert.equal(rows[0]?.generation, (BigInt(work.generation) + 1n).toString())
      assert.equal(rows[0]?.eligibility_completed_at, null)
    },
    undefined,
    'markStoryPostRelatedUrlProjection',
  )
}

export async function captureRssGenerationReset(work: ProjectionWork): Promise<void> {
  const id = 'post-url-replacement-rss-generation-reset'
  registerScenarioContract(id, {
    seededRows: {
      story_post_related_url_projection_jobs: seed.posts.length,
      story_posts: seed.posts.length,
      posts: seed.posts.length,
      rss_feed_items: 1,
      relation__post__related__url: seed.relationRows,
    },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_jobs', max: 1 },
      { kind: 'maxProcessedRows', relation: 'story_posts', max: 1 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 1 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 1 },
      { kind: 'maxProcessedRows', relation: 'relation__post__related__url', max: 1 },
    ],
  })
  await runAndCapture(
    id,
    async () => {
      await using query = await beginTransaction()
      assert.equal(await markStoryPostRelatedUrlProjectionsForStories(query, [work.story_id]), true)
      const { rows } = await query<{ generation: string; eligibility_completed_at: Date | null }>(
        `/* verifyRssStoryPostUrlReplacementReset */ SELECT generation, eligibility_completed_at
        FROM story_post_related_url_projection_jobs WHERE post_id = $1 LIMIT 1`,
        [work.post_id],
      )
      assert.equal(rows[0]?.generation, (BigInt(work.generation) + 1n).toString())
      assert.equal(rows[0]?.eligibility_completed_at, null)
    },
    undefined,
    'markStoryPostRelatedUrlProjectionsForStories',
  )
}

/** Distinct unrelated stories make the keyed RSS membership probe representative. */
export async function seedGenerationResetNoise(): Promise<string[]> {
  const postIds = seed.posts.filter(postId => postId !== seed.posts[3])
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(
    `/* seedGenerationResetNoiseStories */
    INSERT INTO stories (title)
    SELECT 'EXPLAIN unrelated post URL replacement story' FROM unnest($1::uuid[]) input(post_id)
    RETURNING id`,
    [postIds],
  )
  const storyIds = rows.map(row => row.id)
  await query(
    `/* seedGenerationResetNoisePosts */
    INSERT INTO story_posts (post_id, story_id, initiated_by_id)
    SELECT post_id, story_id, $3 FROM unnest($1::uuid[], $2::uuid[]) input(post_id, story_id)`,
    [postIds, storyIds, seed.user],
  )
  await query.commit()
  return storyIds
}

export async function cleanupGenerationResetNoise(storyIds: string[]): Promise<void> {
  await write(`/* cleanupGenerationResetNoise */ DELETE FROM stories WHERE id = ANY($1::uuid[])`, [
    storyIds,
  ])
}
