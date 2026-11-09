import assert from 'node:assert/strict'
import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import { markStoryCategoryProjectionWork } from '@services/post-publication/story-category-projection-work'
import { deleteMergedTopicDerivedPage, derivedReferences } from '@services/topics/merge-derived'
import { seedUuid } from '../seed-data/common.mts'
import { reconcileStoryPostCategoryProjection } from '@services/stories/story-post-category-projection'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** Measure the production global claim against a representative backlog, without claiming it. */
export async function withStoryCategoryPlanBacklog(run: () => Promise<void>): Promise<void> {
  const ids = Array.from({ length: 30_000 }, () => v7())
  try {
    await write(
      `/* seedStoryCategoryClaimStories */ INSERT INTO stories (id, title)
      SELECT id, 'Category claim plan' FROM unnest($1::uuid[]) AS input(id)`,
      [ids],
    )
    await write(
      `/* seedStoryCategoryClaimJobs */ INSERT INTO story_post_category_projection_jobs (story_id, last_processed_at)
      SELECT id, CURRENT_TIMESTAMP FROM unnest($1::uuid[]) AS input(id)`,
      [ids],
    )
    await write(
      `/* seedStoryCategoryMergeReceipts */ INSERT INTO story_post_category_projection_receipts (story_id, topic_id, generation)
       SELECT id, CASE WHEN ordinal <= 101 THEN $2::uuid ELSE $3::uuid END, 1
       FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, ordinal)`,
      [ids, seedUuid(0, '04'), seedUuid(1, '04')],
    )
    await write(
      '/* analyzeStoryCategoryClaimJobs */ ANALYZE story_post_category_projection_jobs, story_post_category_projection_receipts',
    )
    const markedIds = ids.slice(0, 10_000)
    registerScenarioContract('story-category-mark-maximum', {
      allowEmptyResult: true,
      seededRows: { story_post_category_projection_jobs: ids.length },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'stories', max: 10_000 },
        { kind: 'maxProcessedRows', relation: 'story_post_category_projection_jobs', max: 20_000 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 10_000 },
      ],
    })
    await using markQuery = await beginTransaction()
    await runAndCapture(
      'story-category-mark-maximum',
      async () => {
        await markStoryCategoryProjectionWork(markQuery, markedIds)
        const result = await markQuery<{ count: number }>(
          '/* countStoryCategoryMaximumMarks */ SELECT count(*)::int AS count FROM story_post_category_projection_jobs WHERE story_id = ANY($1::uuid[]) AND generation = 2',
          [markedIds],
        )
        assert.equal(result.rows[0]?.count, markedIds.length)
      },
      undefined,
      ['markStoryCategoryProjectionWork', 'setStoryCategoryProjectionHighWater'],
      { afterCapture: () => markQuery.rollback() },
    )
    registerScenarioContract('story-category-topic-merge', {
      allowEmptyResult: true,
      seededRows: {
        story_post_category_projection_jobs: ids.length,
        story_post_category_projection_receipts: ids.length,
      },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'story_post_category_projection_receipts', max: 200 },
        { kind: 'maxProcessedRows', relation: 'story_post_category_projection_jobs', max: 200 },
        { kind: 'maxProcessedRows', relation: 'stories', max: 100 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 100 },
      ],
    })
    const position = derivedReferences.findIndex(
      ([table]) => table === 'story_post_category_projection_receipts',
    )
    assert.notEqual(position, -1)
    await using mergeQuery = await beginTransaction()
    await runAndCapture(
      'story-category-topic-merge',
      async () => {
        assert.equal(
          await deleteMergedTopicDerivedPage(mergeQuery, position, seedUuid(0, '04'), 100),
          100,
        )
      },
      undefined,
      [
        'selectTopicMergeStoryCategoryReceipts',
        'markStoryCategoryProjectionWork',
        'setStoryCategoryProjectionHighWater',
        'deleteTopicMergeStoryCategoryReceipts',
      ],
      { afterCapture: () => mergeQuery.rollback() },
    )
    registerScenarioContract('story-category-global-claim', {
      seededRows: { story_post_category_projection_jobs: ids.length },
      forbidSequentialScans: ['story_post_category_projection_jobs'],
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_story_post_category_projection_jobs__last_processed'],
        },
        { kind: 'maxProcessedRows', relation: 'story_post_category_projection_jobs', max: 2 },
      ],
    })
    await using query = await beginTransaction()
    await runAndCapture(
      'story-category-global-claim',
      async () => {
        assert.equal(
          (await reconcileStoryPostCategoryProjection({ query, batchSize: 1 })).continue,
          true,
        )
      },
      undefined,
      'claimStoryCategoryProjection',
      { afterCapture: () => query.rollback() },
    )
    await run()
  } finally {
    await write(
      '/* cleanupStoryCategoryClaimReceipts */ DELETE FROM story_post_category_projection_receipts WHERE story_id = ANY($1::uuid[])',
      [ids],
    )
    await write(
      '/* cleanupStoryCategoryClaimJobs */ DELETE FROM story_post_category_projection_jobs WHERE story_id = ANY($1::uuid[])',
      [ids],
    )
    await write(
      '/* cleanupStoryCategoryClaimStories */ DELETE FROM stories WHERE id = ANY($1::uuid[])',
      [ids],
    )
    await write(
      '/* analyzeAfterStoryCategoryClaimJobs */ ANALYZE story_post_category_projection_jobs',
    )
  }
}
