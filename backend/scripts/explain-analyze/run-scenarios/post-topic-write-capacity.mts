import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import {
  POST_CONTENT_LIMITS_MAX_VALUES,
  postContentLimitsConfig,
} from '@services/post-content-limits'
import { applyPostTransactionSideEffects } from '@services/posts/create/transaction-side-effects'
import { validateCreatePostInput } from '@services/posts/create/validation'
import { assertValidPostUpdate } from '@services/posts/update/validation'
import { MAX_MANUAL_TAGS, manualTagLimitConfig } from '@services/tag-limits'
import { getPostByAny } from '@services/posts/get'
import { syncPostDataPointTopicsInTransaction } from '@services/posts/update/data-point-relations'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  cardTopicFixture,
  dataPointInput,
  orderedTopics,
  postTopicFixture,
  readPointTopics,
  readRatings,
  seedPointTopics,
} from './post-topic-write-capacity-fixtures.mts'

const reviewLimit = POST_CONTENT_LIMITS_MAX_VALUES.review_topic_ratings_max_items
const topicLimit = Math.min(
  POST_CONTENT_LIMITS_MAX_VALUES.data_point_topic_ids_max_items,
  MAX_MANUAL_TAGS,
)

async function withDataPointLimit(run: () => Promise<void>): Promise<void> {
  await Promise.all([
    postContentLimitsConfig.waitForInitialization(),
    manualTagLimitConfig.waitForInitialization(),
  ])
  const restoreContentLimit = overrideDynamicConfigFieldsForTest(postContentLimitsConfig, {
    data_point_topic_ids_max_items: topicLimit,
  })
  const restoreTagLimit = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, {
    just_joined: topicLimit,
    free: topicLimit,
  })
  try {
    await run()
  } finally {
    restoreTagLimit()
    restoreContentLimit()
  }
}

export async function runReviewRatingWriteCapacity(): Promise<void> {
  const scenario = 'post-review-ratings-write-at-cap'
  // Both modes insert the same 100 rows. The forced-custom trigger cost is tracked in #6401.
  registerScenarioContract(scenario, { allowEmptyResult: true, expectations: [] })
  const ratings = Array.from({ length: reviewLimit }, (_, index) => ({
    topic_id: seedUuid(index, '04'),
    rating: (index % 5) + 1,
  }))
  await postTopicFixture('review', async postId => {
    await postContentLimitsConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(postContentLimitsConfig, {
      review_topic_ratings_max_items: reviewLimit,
    })
    try {
      await runAndCapture(
        scenario,
        async () => {
          await using query = await beginTransaction()
          const unrelatedId = seedUuid(1, '05')
          const unrelated = await readRatings(query, unrelatedId)
          assert.ok(unrelated.length > 0)
          await applyPostTransactionSideEffects({
            creator: seedUser,
            options: { query },
            post: { id: postId, title: null },
            postType: 'review',
            updates: { review_topic_ratings: ratings },
          })
          assert.deepEqual(
            await readRatings(query, postId),
            ratings.map((rating, order_index) => ({ ...rating, order_index })),
          )
          assert.deepEqual(await readRatings(query, unrelatedId), unrelated)
          await query.rollback()
        },
        undefined,
        'createPost:reviewRatings',
      )
    } finally {
      restore()
    }
  })
}

export async function runDataPointTopicInsertCapacity(): Promise<void> {
  const scenario = 'post-data-point-topics-insert-at-cap'
  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    expectations: [{ kind: 'maxInputRows', nodeType: 'Function Scan', max: topicLimit }],
  })
  await withDataPointLimit(() =>
    cardTopicFixture(topicLimit, topicIds =>
      postTopicFixture('data_point', async postId => {
        await runAndCapture(
          scenario,
          async () => {
            await using query = await beginTransaction()
            const unrelatedId = seedUuid(2, '05')
            const unrelated = await readPointTopics(query, unrelatedId)
            assert.ok(unrelated.length > 0)
            const updates = { post_type: 'data_point' as const, ...dataPointInput(topicIds) }
            await validateCreatePostInput(seedUser, updates, null, { query })
            await applyPostTransactionSideEffects({
              creator: seedUser,
              options: { query },
              post: { id: postId, title: null },
              postType: 'data_point',
              updates,
            })
            assert.deepEqual(await readPointTopics(query, postId), orderedTopics(topicIds))
            assert.deepEqual(await readPointTopics(query, unrelatedId), unrelated)
            await query.rollback()
          },
          undefined,
          'insertPostDataPointTopics',
        )
      }),
    ),
  )
}

export async function runDataPointTopicReplaceCapacity(): Promise<void> {
  const scenario = 'post-data-point-topics-replace-at-cap'
  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'post_data_point_topics', max: 2 * topicLimit },
    ],
    forbidSequentialScans: ['post_data_point_topics'],
  })
  const removedCount = Math.floor(topicLimit / 2)
  await withDataPointLimit(() =>
    cardTopicFixture(topicLimit + removedCount, topicIds =>
      postTopicFixture('data_point', async postId => {
        const previous = topicIds.slice(0, topicLimit)
        const replacement = topicIds.slice(removedCount).toReversed()
        await seedPointTopics(postId, previous)
        const post = await getPostByAny(postId)
        assert.ok(post, 'The replacement fixture needs a data-point post')

        await runAndCapture(
          scenario,
          async () => {
            await using query = await beginTransaction()
            const unrelatedId = seedUuid(2, '05')
            const unrelated = await readPointTopics(query, unrelatedId)
            assert.ok(unrelated.length > 0)
            assert.deepEqual(await readPointTopics(query, postId), orderedTopics(previous))
            const changes = dataPointInput(replacement)
            await assertValidPostUpdate(seedUser, post, changes)
            await syncPostDataPointTopicsInTransaction(post, changes, { query })
            assert.deepEqual(await readPointTopics(query, postId), orderedTopics(replacement))
            assert.deepEqual(await readPointTopics(query, unrelatedId), unrelated)
            await query.rollback()
          },
          undefined,
          'updatePost:syncDataPointTopics',
        )
      }),
    ),
  )
}
