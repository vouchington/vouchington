import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { reconcileStoryPostCategoryProjection } from '@services/stories/story-post-category-projection'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export const pageSize = 100

export async function capturePage(id: string, story: string, names: string[]): Promise<void> {
  await capture(id, names, async query => {
    const result = await reconcileStoryPostCategoryProjection({
      storyIds: [story],
      batchSize: pageSize,
      query,
    })
    assert.equal(result.continue, true)
  })
}

export async function capture(
  id: string,
  names: string[],
  action: (query: Awaited<ReturnType<typeof beginTransaction>>) => Promise<void>,
): Promise<void> {
  registerScenarioContract(id, {
    allowEmptyResult: true,
    seededRows: {
      story_post_category_projection_jobs: 30_000,
      story_post_category_projection_receipts: 31_101,
    },
    forbidSequentialScans: [
      'story_post_category_projection_jobs',
      'story_post_category_projection_receipts',
    ],
    expectations: [
      { kind: 'maxProcessedRows', relation: 'stories', max: 2 },
      { kind: 'maxProcessedRows', relation: 'story_post_category_projection_jobs', max: 8 },
      {
        kind: 'maxProcessedRows',
        relation: 'story_post_category_projection_receipts',
        max: 2 * (pageSize + 1),
      },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: pageSize + 1 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_categories', max: pageSize + 1 },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__post__category__topic',
        // One candidate lookup, one target lookup, and one updated row per page entry.
        max: 3 * (pageSize + 1),
      },
    ],
  })
  await using query = await beginTransaction()
  await runAndCapture(id, () => action(query), undefined, names, {
    afterCapture: () => query.rollback(),
  })
}
