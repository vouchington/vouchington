import { describe, expect, it } from 'vitest'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  getContributionAdmissionConsumptionCountForTest,
  getContributionAdmissionPolicyRevisionForTest,
  getTopicImportRequestCountByRecommendationForTest,
  insertPendingTopicImportRequestForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { contributionLimitConfig } from '@services/contribution-gating/limits-config'
import { deletePendingRecommendation } from '@services/topic-recommendations'
import { IDEMPOTENCY_KEY_REUSED } from '@modules/on-error/error-codes'
import {
  admitImportedTopicRecommendation,
  stableTopicImportIdempotencyKey,
} from './admit-topic-recommendation.mts'
import { importTopics } from './import-topics.mts'

describe('topic import admission', () => {
  it('records an explicit exempt policy revision for administrator imports', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      administrator: true,
    })
    const slug = `administrator-import-${crypto.randomUUID()}`
    const importAttemptId = crypto.randomUUID()

    await expect(
      admitImportedTopicRecommendation(
        user,
        { name: `Administrator import ${crypto.randomUUID()}`, slug },
        null,
        importAttemptId,
      ),
    ).resolves.toMatchObject({ kind: 'created' })

    await expect(
      getContributionAdmissionPolicyRevisionForTest({
        actorId: user.id,
        idempotencyKey: stableTopicImportIdempotencyKey(user.id, importAttemptId, slug),
      }),
    ).resolves.toBe('capacity-exempt')
  })

  it('uses daily-only capacity across a missing-topic import batch', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const batch = Array.from(
      { length: 4 },
      (_, index) => `Daily-only imported topic ${index} ${crypto.randomUUID()}`,
    )
    const restorePolicy = overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      authored_post_free_short_limit: 1,
      authored_post_free_daily_limit: 3,
      topic_recommendation_free_short_limit: 1,
      topic_recommendation_free_daily_limit: 3,
    })

    try {
      const results = await importTopics(user, batch, {
        assertCanCreateTopicRecommendations: async () => {},
        importAttemptId: crypto.randomUUID(),
      })

      expect(results.slice(0, 3)).toEqual(
        batch
          .slice(0, 3)
          .map(input => expect.objectContaining({ input, status: 'recommendation_created' })),
      )
      expect(results[3]).toMatchObject({
        input: batch[3],
        status: 'error',
        error: 'Contribution limit exceeded. Please try again later.',
      })
      await expect(
        getContributionAdmissionConsumptionCountForTest(user.id, 'topic_recommendation'),
      ).resolves.toBe(3)
    } finally {
      restorePolicy()
    }
  })

  it('replays a missing-name recommendation without creating or charging twice', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicName = `Imported admission ${crypto.randomUUID()}`

    const options = {
      assertCanCreateTopicRecommendations: async () => {},
      importAttemptId: crypto.randomUUID(),
    }
    const [first] = await importTopics(user, [topicName], options)
    const [replay] = await importTopics(user, [topicName], options)

    expect(first).toMatchObject({ status: 'recommendation_created' })
    expect(replay).toEqual({
      input: topicName,
      status: 'recommendation_created',
      recommendation_post_id: first?.recommendation_post_id,
    })
    if (!first?.recommendation_post_id) throw new Error('Expected recommendation audit identity')
    await expect(
      getTopicImportRequestCountByRecommendationForTest(user.id, first.recommendation_post_id),
    ).resolves.toBe(1)
    await expect(
      getContributionAdmissionConsumptionCountForTest(user.id, 'topic_recommendation'),
    ).resolves.toBe(1)
  })

  it('keeps old import-audit writers compatible during the uniqueness rollout', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicName = `Mixed-version import ${crypto.randomUUID()}`
    const [created] = await importTopics(user, [topicName], {
      assertCanCreateTopicRecommendations: async () => {},
      importAttemptId: crypto.randomUUID(),
    })
    if (!created?.recommendation_post_id)
      throw new Error('Expected a recommendation-backed import audit')

    await expect(
      insertPendingTopicImportRequestForTest(user.id, created.recommendation_post_id, topicName),
    ).resolves.toBeUndefined()
    await expect(
      getTopicImportRequestCountByRecommendationForTest(user.id, created.recommendation_post_id),
    ).resolves.toBe(1)
  })

  it('serializes concurrent old-writer recommendation audits', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      administrator: true,
    })
    const input = {
      name: `Concurrent old-writer import ${crypto.randomUUID()}`,
      slug: `concurrent-old-writer-import-${crypto.randomUUID()}`,
    }
    const owner = await admitImportedTopicRecommendation(user, input, null, crypto.randomUUID())
    if (owner.kind !== 'created') throw new Error('Expected a recommendation to audit')

    await expect(
      Promise.all([
        insertPendingTopicImportRequestForTest(user.id, owner.response.id, input.name),
        insertPendingTopicImportRequestForTest(user.id, owner.response.id, input.name),
      ]),
    ).resolves.toEqual([undefined, undefined])
    await expect(
      getTopicImportRequestCountByRecommendationForTest(user.id, owner.response.id),
    ).resolves.toBe(1)
  })

  it('rejects a slug-derived key when the imported name changes', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const slug = `import-intent-${crypto.randomUUID()}`
    const importAttemptId = crypto.randomUUID()
    await expect(
      admitImportedTopicRecommendation(user, { name: 'First name', slug }, null, importAttemptId),
    ).resolves.toMatchObject({ kind: 'created' })

    await expect(
      admitImportedTopicRecommendation(user, { name: 'Changed name', slug }, null, importAttemptId),
    ).rejects.toMatchObject({ code: IDEMPOTENCY_KEY_REUSED, status: 409 })
    await expect(
      getContributionAdmissionConsumptionCountForTest(user.id, 'topic_recommendation'),
    ).resolves.toBe(1)
  })

  it('reuses an attempt key for retries but not a later import after withdrawal', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const input = {
      name: `Withdrawn imported topic ${crypto.randomUUID()}`,
      slug: `withdrawn-imported-topic-${crypto.randomUUID()}`,
    }
    const firstAttemptId = crypto.randomUUID()
    const first = await admitImportedTopicRecommendation(user, input, null, firstAttemptId)
    if (first.kind !== 'created') throw new Error('Expected the first import attempt to create')
    await deletePendingRecommendation(user, first.response)

    const replay = await admitImportedTopicRecommendation(user, input, null, firstAttemptId)
    if (replay.kind !== 'replay') throw new Error('Expected the matching import retry to replay')
    expect(replay.response.id).toBe(first.response.id)

    const laterAttempt = await admitImportedTopicRecommendation(
      user,
      input,
      null,
      crypto.randomUUID(),
    )
    if (laterAttempt.kind !== 'created') throw new Error('Expected a new import attempt to create')
    expect(laterAttempt.response.id).not.toBe(first.response.id)
  })
})
