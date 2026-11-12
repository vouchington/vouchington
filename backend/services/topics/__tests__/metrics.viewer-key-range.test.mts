import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  insertTestReview,
  insertTestDataPoint,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { topicsWorkConfig } from '../work-limits.mts'
import { getTopicViewerCounts } from '../metrics.mts'

describe('topic viewer attachment key intervals', () => {
  it.each(['reviews', 'data-points'] as const)(
    'includes old and current %s only for the requested topic',
    async kind => {
      await topicsWorkConfig.waitForInitialization()
      const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
        viewer_count_input_cap: 3,
      })
      try {
        const viewer = await createTestUser()
        const topics = []
        for (let index = 0; index < 3; index += 1)
          topics.push(await createTestTopic({ user: viewer }))
        topics.sort((left, right) => left.id.localeCompare(right.id))
        const requested = topics[1]!
        for (const [index, topic] of topics.entries()) {
          const dates = index === 1 ? [new Date(0), new Date()] : [new Date()]
          for (const createdAt of dates) {
            if (kind === 'reviews')
              await insertTestReview({
                userId: viewer.id,
                topicRatings: [{ topicId: topic.id, rating: 5 }],
                createdAt,
              })
            else
              await insertTestDataPoint({
                title: `Interval ${topic.id}`,
                slug: `interval-${topic.id}-${createdAt.getTime()}`,
                createdById: viewer.id,
                topicId: topic.id,
                createdAt,
              })
          }
        }
        expect(await getTopicViewerCounts(viewer, requested.id)).toMatchObject({
          [kind]: 2,
          count_capped: { [kind]: false },
        })
      } finally {
        restore()
      }
    },
  )
})
