import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { cleanupStaleStoryPostRelatedUrlProjectionReceipts } from '@services/stories/story-post-related-url-projection-cleanup'
import type { ProjectionWork } from '@services/stories/story-post-related-url-projection-types'
import { getStoriesWorkLimit } from '@services/stories/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  removeStoryProjectionDispatcherWitness,
  seedStoryProjectionDispatcherWitness,
} from '../seed-data/story-post-related-url-projection.mts'

export async function runStoryProjectionReceiptCleanupScenario(): Promise<void> {
  const fixture = await seedStoryProjectionDispatcherWitness()
  const limit = getStoriesWorkLimit('crawl_effect_page_size')
  const [otherPostId, , postId] = fixture.postIds
  assert.ok(postId && otherPostId)
  try {
    const {
      rows: [work],
    } = await write<ProjectionWork>(
      `/* seedStoryProjectionReceiptLease */ UPDATE story_post_related_url_projection_jobs
       SET generation = 2 WHERE post_id = $1
       RETURNING post_id, story_id, generation, lease_token, sweep_upper_bound_source_id, source_completed_at`,
      [postId],
    )
    assert.ok(work?.lease_token)
    const { rows: urls } = await write<{ url_id: string; source_item_id: string }>(
      `/* selectStoryProjectionReceiptUrls */ SELECT DISTINCT ON (url_id) url_id, id AS source_item_id
       FROM rss_feed_items WHERE deleted_at IS NULL AND url_id IS NOT NULL
       ORDER BY url_id, id LIMIT $1`,
      [limit + 2],
    )
    assert.equal(urls.length, limit + 2)
    const protectedUrlId = urls[0]!.url_id
    const lastUrlId = urls.at(-1)!.url_id
    await seedReceipts(otherPostId, '1', urls)
    await seedReceipts(postId, '2', [urls[0]!])
    await seedReceipts(postId, '1', urls, protectedUrlId)
    const scenario = 'story-projection-stale-receipts-at-cap'
    registerScenarioContract(scenario, { allowEmptyResult: true, expectations: [] })
    await runAndCapture(
      scenario,
      async () =>
        assert.equal(await cleanupStaleStoryPostRelatedUrlProjectionReceipts(work, limit), limit),
      undefined,
      'cleanupStaleStoryPostRelatedUrlProjectionReceipts',
      {
        afterCapture: async () => {
          assert.deepEqual(await remainingReceipts(postId), [
            { generation: '1', url_id: protectedUrlId },
            { generation: '1', url_id: lastUrlId },
            { generation: '2', url_id: protectedUrlId },
          ])
          assert.equal(await cleanupStaleStoryPostRelatedUrlProjectionReceipts(work, limit), 1)
          assert.deepEqual(await remainingReceipts(postId), [
            { generation: '1', url_id: protectedUrlId },
            { generation: '2', url_id: protectedUrlId },
          ])
          assert.deepEqual(
            await remainingReceipts(otherPostId),
            urls.map(({ url_id }) => ({ generation: '1', url_id })),
          )
          await seedReceipts(postId, '1', urls, protectedUrlId)
        },
      },
    )
  } finally {
    await removeStoryProjectionDispatcherWitness(fixture)
  }
}

async function seedReceipts(
  postId: string,
  generation: string,
  rows: readonly { url_id: string; source_item_id: string }[],
  protectedUrlId: string | null = null,
) {
  await write(
    `/* seedStoryProjectionReceiptPage */ INSERT INTO story_post_related_url_projection_receipts
      (post_id, generation, url_id, source_item_id, is_eligible, should_crawl)
      SELECT $1, $2, input.url_id, input.source_item_id, TRUE, input.url_id = $5::uuid
      FROM unnest($3::uuid[], $4::uuid[]) AS input(url_id, source_item_id)
      ON CONFLICT DO NOTHING`,
    [
      postId,
      generation,
      rows.map(row => row.url_id),
      rows.map(row => row.source_item_id),
      protectedUrlId,
    ],
  )
}

async function remainingReceipts(postId: string) {
  const { rows } = await write<{ generation: string; url_id: string }>(
    `/* checkStoryProjectionReceiptPage */ SELECT generation, url_id
      FROM story_post_related_url_projection_receipts
      WHERE post_id = $1 ORDER BY generation, url_id`,
    [postId],
  )
  return rows
}
