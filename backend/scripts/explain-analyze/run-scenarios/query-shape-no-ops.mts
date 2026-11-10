import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getTopicsBySlugBatch } from '@services/topics/get-batch'
import { searchPrimaryEnabledRssFeedIdsByTopicIds } from '@services/rss-feeds/search-by-topic-ids'
import { getPendingApplicationCommunityIds } from '@services/communities/applications/pending'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

/** Covers the three keyed reads whose no-op deduplication was removed. */
export async function runQueryShapeNoOpScenarios(): Promise<void> {
  registerScenarioContract('topic-slug-batch-unique', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'topics', max: 15 }],
  })
  await runAndCapture(
    'topic-slug-batch-unique',
    async () => {
      const results = await getTopicsBySlugBatch(['seed-topic-0', 'seed-topic-1', 'seed-topic-0'])
      assert.deepEqual(
        results.map(topic => topic?.id),
        [seedUuid(0, '04'), seedUuid(1, '04'), seedUuid(0, '04')],
      )
    },
    undefined,
    'getTopicsBySlugBatch',
  )

  registerScenarioContract('primary-rss-feeds-by-topic-unique', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'rss_feeds', max: 8 }],
  })
  await runAndCapture(
    'primary-rss-feeds-by-topic-unique',
    async () => {
      const results = await searchPrimaryEnabledRssFeedIdsByTopicIds([
        seedUuid(0, '04'),
        seedUuid(1, '04'),
      ])
      assert.deepEqual(results.toSorted(), [seedUuid(0, '08'), seedUuid(1, '08')].toSorted())
    },
    undefined,
    'searchPrimaryEnabledRssFeedIdsByTopicIds',
  )

  await capturePendingApplication()
}

async function capturePendingApplication(): Promise<void> {
  const applicationId = seedUuid(0, '6e')
  const userId = seedUuid(100, '01')
  const communityId = seedUuid(0, '14')
  const inserted = await write<{ id: string }>(
    `/* seedQueryShapeNoOps:pendingApplication */
      INSERT INTO community_applications (id, community_id, user_id, created_via)
      VALUES ($1, $2, $3, 'system')
      ON CONFLICT DO NOTHING RETURNING id`,
    [applicationId, communityId, userId],
  )
  try {
    registerScenarioContract('pending-application-community-unique', {
      expectations: [{ kind: 'maxProcessedRows', relation: 'community_applications', max: 3 }],
    })
    await runAndCapture(
      'pending-application-community-unique',
      async () => {
        const results = await getPendingApplicationCommunityIds(userId, [
          communityId,
          seedUuid(1, '14'),
          communityId,
        ])
        assert.deepEqual([...results], [communityId])
      },
      undefined,
      'getPendingApplicationCommunityIds',
    )
  } finally {
    if (inserted.rows.length > 0) {
      await write(
        '/* seedQueryShapeNoOps:cleanup */ DELETE FROM community_applications WHERE id = $1',
        [applicationId],
      )
    }
  }
}
