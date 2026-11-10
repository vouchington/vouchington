import { describe, expect, it, vi } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getTopicImportRequestCountByRecommendationForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { recordTopicImportRequests } from './import-topics-queries.mts'
import { importTopics } from './import-topics.mts'

describe('topic import retry', () => {
  it('preserves the retry outcome when pre-retry audit persistence fails', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      administrator: true,
    })
    const topicNames = [
      `Audit retry first ${crypto.randomUUID()}`,
      `Audit retry second ${crypto.randomUUID()}`,
    ]
    const auditFailure = new Error('Import audit write failed')
    const recordImportRequests = vi
      .fn<typeof recordTopicImportRequests>()
      .mockRejectedValueOnce(auditFailure)
      .mockImplementation(recordTopicImportRequests)
    const options = {
      assertCanCreateTopicRecommendations: async () => {},
      importAttemptId: crypto.randomUUID(),
      recordImportRequests,
    }

    await expect(importTopics(user, WEB_PROVENANCE, topicNames, options)).rejects.toBe(auditFailure)
    const retried = await importTopics(user, WEB_PROVENANCE, topicNames, options)

    expect(retried).toEqual([
      {
        input: topicNames[0],
        status: 'recommendation_created',
        recommendation_post_id: expect.any(String),
      },
      {
        input: topicNames[1],
        status: 'recommendation_created',
        recommendation_post_id: expect.any(String),
      },
    ])
    expect(recordImportRequests).toHaveBeenCalledTimes(2)
    for (const result of retried) {
      const recommendationId = result.recommendation_post_id
      if (result.status !== 'recommendation_created' || !recommendationId)
        throw new Error('Expected a recommendation')
      await expect(
        getTopicImportRequestCountByRecommendationForTest(user.id, recommendationId),
      ).resolves.toBe(1)
    }
  })
})
