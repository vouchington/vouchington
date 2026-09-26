import { describe, expect, it, vi } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getTopicImportRequestCountByRecommendationForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  claimContributionAdmission,
  discardRejectedContributionAdmission,
} from '@services/contribution-gating/admission-reservations'
import {
  admitImportedTopicRecommendation,
  stableTopicImportIdempotencyKey,
} from './admit-topic-recommendation.mts'
import { prepareTopicInput, recordTopicImportRequests } from './import-topics-queries.mts'
import { importTopics, TopicImportInProgressError } from './import-topics.mts'

describe('topic import retry', () => {
  it('preserves the retry outcome when pre-retry audit persistence fails', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      administrator: true,
    })
    const importAttemptId = crypto.randomUUID()
    const topicNames = [
      `Audit retry first ${crypto.randomUUID()}`,
      `Audit retry held ${crypto.randomUUID()}`,
    ]
    const firstInput = prepareTopicInput(topicNames[0]!, 0)
    const heldInput = prepareTopicInput(topicNames[1]!, 1)
    const heldIntent = {
      route: 'my.import.topics.recommendation',
      topic_title: heldInput.name,
      topic_slug: heldInput.slug,
      markdown: `Imported topic: ${heldInput.name}`,
    }
    const heldClaim = await claimContributionAdmission(
      user.id,
      stableTopicImportIdempotencyKey(user.id, importAttemptId, heldInput.slug),
      heldIntent,
      {
        route: 'my.import.topics.recommendation',
        scope: 'my.import.topics',
        source: 'topic_recommendation',
        postType: 'topic_recommendation',
        policyRevision: 'capacity-exempt',
      },
    )
    if (heldClaim.kind !== 'claimed') throw new Error('Expected to seed an active import claim')

    const auditFailure = new Error('Import audit write failed')
    const recordImportRequests = vi
      .fn<typeof recordTopicImportRequests>()
      .mockRejectedValueOnce(auditFailure)
      .mockImplementation(recordTopicImportRequests)
    const options = {
      assertCanCreateTopicRecommendations: async () => {},
      importAttemptId,
      recordImportRequests,
    }

    await expect(importTopics(WEB_PROVENANCE, user, topicNames, options)).rejects.toBe(auditFailure)
    await expect(importTopics(WEB_PROVENANCE, user, topicNames, options)).rejects.toBeInstanceOf(
      TopicImportInProgressError,
    )

    const first = await admitImportedTopicRecommendation(
      WEB_PROVENANCE,
      user,
      firstInput,
      null,
      importAttemptId,
    )
    if (first.kind !== 'replay') throw new Error('Expected the first recommendation to replay')
    await expect(
      getTopicImportRequestCountByRecommendationForTest(user.id, first.response.id),
    ).resolves.toBe(1)

    await discardRejectedContributionAdmission(heldClaim.reservationId, heldClaim.leaseId)
    const heldOwner = await admitImportedTopicRecommendation(
      WEB_PROVENANCE,
      user,
      heldInput,
      null,
      importAttemptId,
    )
    if (heldOwner.kind !== 'created') throw new Error('Expected the held recommendation to settle')

    await expect(importTopics(WEB_PROVENANCE, user, topicNames, options)).resolves.toEqual([
      {
        input: topicNames[0],
        status: 'recommendation_created',
        recommendation_post_id: first.response.id,
      },
      {
        input: topicNames[1],
        status: 'recommendation_created',
        recommendation_post_id: heldOwner.response.id,
      },
    ])
    expect(recordImportRequests).toHaveBeenCalledTimes(3)
    await expect(
      getTopicImportRequestCountByRecommendationForTest(user.id, heldOwner.response.id),
    ).resolves.toBe(1)
  })
})
