import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { searchRecentAutomodActions } from '@services/moderation-training/recent-actions'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  cleanupRecentAutomodActionCapacity,
  seedRecentAutomodActionCapacity,
} from '../seed-data/recent-automod-action-capacity.mts'

const SCENARIO = 'recent-automod-actions-at-cap'
const PAGE_LIMIT = 100
const QUERY_NAMES = ['searchRecentAutomodActions:paged', 'searchRecentAutomodActions:stats']

export async function runRecentAutomodActionCapacityScenario(): Promise<void> {
  const { communityIds, postIds, expectedKeys, stats } = await seedRecentAutomodActionCapacity()
  try {
    await write(
      `/* analyzeRecentAutomodActionCapacity */
       ANALYZE posts, post_moderation_versions, post_moderation_dispositions, moderation_training_feedbacks`,
    )
    const { rows } = await write<{
      moderation_training_feedbacks: number
      post_moderation_versions: number
      post_moderation_dispositions: number
      moderator_agents: number
    }>(`/* countRecentAutomodFixtureRelations */
      SELECT (SELECT count(*)::int FROM moderation_training_feedbacks) AS moderation_training_feedbacks,
             (SELECT count(*)::int FROM post_moderation_versions) AS post_moderation_versions,
             (SELECT count(*)::int FROM post_moderation_dispositions) AS post_moderation_dispositions,
             (SELECT count(*)::int FROM moderator_agents) AS moderator_agents`)
    const corpus = rows[0]!
    const feedbackRows = corpus.moderation_training_feedbacks
    registerScenarioContract(SCENARIO, {
      seededRows: corpus,
      crossPartition: {
        posts: 'A recent action can apply to an older post in any partition.',
        agent_moderations:
          'An agent action may use moderation rows from different post partitions.',
      },
      // Main performs a full feedback scan per action. Allow one rounding row per EXPLAIN loop.
      // https://github.com/vouchington/vouchington/issues/6571 tracks the keyed lookup.
      expectations: [225, 225, 116, 225].map((scans, captureIndex) => ({
        kind: 'maxProcessedRows',
        relation: 'moderation_training_feedbacks',
        captureIndex,
        max: scans * (feedbackRows + 1) + (captureIndex % 2 === 0 ? 0 : stats.false_positive_count),
      })),
    })
    assert.equal(expectedKeys.length, 205)
    let continuation: string | undefined
    await runAndCapture(
      SCENARIO,
      async () => {
        for (const offset of [0, PAGE_LIMIT]) {
          const page = await searchRecentAutomodActions(communityIds[0]!, {
            limit: PAGE_LIMIT,
            after: continuation,
          })
          assert.deepEqual(
            page.actions.map(action => action.source_key),
            expectedKeys.slice(offset, offset + PAGE_LIMIT),
          )
          assert.equal(page.hasNextPage, true)
          assert.ok(page.endCursor)
          assert.deepEqual(page.stats, stats)
          continuation = page.endCursor
        }
      },
      undefined,
      QUERY_NAMES,
      {
        exactCapturedNames: [...QUERY_NAMES, ...QUERY_NAMES],
        afterCapture: async () => {
          const last = await searchRecentAutomodActions(communityIds[0]!, {
            limit: PAGE_LIMIT,
            after: continuation,
          })
          assert.deepEqual(
            last.actions.map(action => action.source_key),
            expectedKeys.slice(PAGE_LIMIT * 2),
          )
          assert.equal(last.hasNextPage, false)
          assert.equal(last.endCursor, null)
          assert.deepEqual(last.stats, stats)
        },
      },
    )
  } finally {
    await cleanupRecentAutomodActionCapacity(communityIds, postIds)
  }
}
