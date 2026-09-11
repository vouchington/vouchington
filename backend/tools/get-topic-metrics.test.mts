import { beforeAll, describe, expect, it } from 'vitest'
import getTopicMetricsTool from './get-topic-metrics.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import type { PrivateUser } from '@services/users/types'

describe('get_topic_metrics tool — real DB', () => {
  let user: PrivateUser
  let topicId: string
  const suffix = crypto.randomUUID().slice(0, 8)

  beforeAll(async () => {
    user = await createTestUser()
    topicId = await insertTestTopic({
      name: `Metrics Tool Topic ${suffix}`,
      slug: `metrics-tool-topic-${suffix}`,
      createdById: user.id,
    })
  })

  it('returns metrics for an existing topic', async () => {
    const execute = getTopicMetricsTool.function(user)
    const result = await execute({ topic_id: topicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.topic_id).toBe(topicId)
    expect(typeof result.discussions).toBe('number')
    expect(typeof result.reviews).toBe('number')
    expect(typeof result.data_points).toBe('number')
    expect(typeof result.news).toBe('number')
    expect(typeof result.followers).toBe('number')
    expect(result.ratings).toMatchObject({
      count_1: expect.any(Number),
      count_2: expect.any(Number),
      count_3: expect.any(Number),
      count_4: expect.any(Number),
      count_5: expect.any(Number),
    })
  })

  it('returns success: false for unknown topic', async () => {
    const execute = getTopicMetricsTool.function(user)
    const result = await execute({ topic_id: crypto.randomUUID() })

    expect(result.success).toBe(false)
  })
})
