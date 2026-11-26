import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import {
  markStoryPostRelatedUrlProjectionsForStories,
  refreshStoryPostRelatedUrlProjectionSources,
} from '@services/rss-feed-items/story-post-related-url-projections'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { contentHash } from '../seed-data/common.mts'
import type { RssWriteCapacityFixture } from './rss-write-capacity-fixture.mts'

type ProjectionJob = {
  post_id: string
  story_id: string
  generation: string
  sweep_upper_bound_source_id: string | null
  source_completed_at: Date | null
  lease_token: string | null
}

export async function runRssStoryProjectionRefreshScenario(fixture: RssWriteCapacityFixture) {
  const count = fixture.itemIds.length
  const { storyIds, postIds } = await seedProjectionRefresh(fixture)
  const restartedCount = Math.floor(count / 2)
  const scenario = 'rss-story-projection-restart-at-fetch-cap'
  try {
    registerScenarioContract(scenario, {
      expectations: [],
      crossPartition: {
        posts: 'One fetch can revise stories whose posts were written in different ID partitions.',
      },
    })
    await runAndCapture(
      scenario,
      async () => {
        await using query = await beginTransaction()
        assert.equal(await markStoryPostRelatedUrlProjectionsForStories(query, storyIds), true)
        const { rows: jobs } = await query<ProjectionJob>(
          `/* checkRssStoryProjectionRefresh */
           SELECT post_id, story_id, generation, sweep_upper_bound_source_id, source_completed_at, lease_token
           FROM story_post_related_url_projection_jobs WHERE post_id = ANY($1::uuid[]) ORDER BY post_id`,
          [postIds],
        )
        assert.deepEqual(
          jobs,
          postIds.map((postId, index) => ({
            post_id: postId,
            story_id: storyIds[index]!,
            generation: index < restartedCount ? '2' : '1',
            sweep_upper_bound_source_id: fixture.itemIds[index]!,
            source_completed_at: null,
            lease_token: null,
          })),
        )
        await query.rollback()
      },
      undefined,
      'markStoryPostRelatedUrlProjectionsForStories',
    )
    await captureSourceRefresh(storyIds, postIds, fixture.itemIds)
  } finally {
    await write(
      '/* cleanupRssStoryProjectionPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
      [postIds],
    )
    await write(
      '/* cleanupRssStoryProjectionStories */ DELETE FROM stories WHERE id = ANY($1::uuid[])',
      [storyIds],
    )
  }
}

async function captureSourceRefresh(
  storyIds: readonly string[],
  postIds: readonly string[],
  itemIds: readonly string[],
) {
  // Each statement is replayed independently. Add the jobs that the restart would insert.
  await write(
    `/* seedRssStoryProjectionSourceRefreshJobs */ INSERT INTO story_post_related_url_projection_jobs
       (post_id, story_id)
     SELECT post_id, story_id FROM unnest($1::uuid[], $2::uuid[]) AS input(post_id, story_id)
     ON CONFLICT (post_id) DO NOTHING`,
    [postIds, storyIds],
  )
  const scenario = 'rss-story-projection-source-refresh-at-fetch-cap'
  registerScenarioContract(scenario, {
    expectations: [],
    crossPartition: {
      rss_feed_items: 'A revised story can have retained members from different ID partitions.',
    },
  })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      const rows = await refreshStoryPostRelatedUrlProjectionSources(query, postIds)
      assert.equal(rows.length, itemIds.length)
      assert.deepEqual(new Set(rows.map(row => row.sweep_upper_bound_source_id)), new Set(itemIds))
      await query.rollback()
    },
    undefined,
    'refreshStoryPostRelatedUrlProjectionSources',
  )
}

async function seedProjectionRefresh(fixture: RssWriteCapacityFixture) {
  const count = fixture.itemIds.length
  const restartedCount = Math.floor(count / 2)
  const title = `${fixture.prefix} story projection refresh`
  await using query = await beginTransaction()
  const { rows: stories } = await query<{ id: string }>(
    `/* seedRssStoryProjectionStories */ INSERT INTO stories (title)
     SELECT $1::text FROM generate_series(1, $2::int) RETURNING id`,
    [title, count],
  )
  const { rows: posts } = await query<{ id: string }>(
    `/* seedRssStoryProjectionPosts */ INSERT INTO posts
      (created_via, post_type, title, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
     SELECT 'system', 'story', $1::text, $3::bytea, $3::bytea FROM generate_series(1, $2::int)
     RETURNING id`,
    [title, count, contentHash(title)],
  )
  const storyIds = stories.map(row => row.id).toSorted()
  const postIds = posts.map(row => row.id).toSorted()
  await query(
    `/* seedRssStoryProjectionAssignments */
     WITH targets AS (
       SELECT story_id, post_id, item_id FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS input(story_id, post_id, item_id)
     ), links AS (
       INSERT INTO story_posts (post_id, story_id, initiated_by_id)
       SELECT post_id, story_id, $4 FROM targets
     )
     UPDATE rss_feed_items item SET story_id = targets.story_id FROM targets WHERE item.id = targets.item_id`,
    [storyIds, postIds, fixture.itemIds, seedUser.id],
  )
  await query(
    `/* seedRssStoryProjectionExistingJobs */ INSERT INTO story_post_related_url_projection_jobs
      (post_id, story_id, source_completed_at, lease_token, leased_at, lease_expires_at)
     SELECT post_id, story_id, CURRENT_TIMESTAMP, uuidv7(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'
     FROM unnest($1::uuid[], $2::uuid[]) AS input(post_id, story_id)`,
    [postIds.slice(0, restartedCount), storyIds.slice(0, restartedCount)],
  )
  await query.commit()
  return { storyIds, postIds }
}
