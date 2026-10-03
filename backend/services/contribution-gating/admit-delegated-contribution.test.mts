import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestPrivateUserById,
  executeTestAdmittedPost,
  insertLegacyContributionAdmissionConsumptionForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { admitDelegatedContribution } from './admit-delegated-contribution.mts'
import { contributionLimitConfig } from './limits-config.mts'

async function input() {
  const user = await createTestUser()
  return {
    authority: { kind: 'delegated' as const, credentialOwnerId: user.id },
    currentUser: (await getTestPrivateUserById(user.id))!,
    membershipPlan: 'plus' as const,
    source: 'topic_recommendation' as const,
    scope: 'topic_recommendation',
    postType: 'topic_recommendation',
    idempotencyKey: crypto.randomUUID(),
    intent: { route: 'topic-recommendations.create', body: { title: crypto.randomUUID() } },
    execute: executeTestAdmittedPost,
  }
}

describe('delegated contribution admission — real store', () => {
  beforeAll(async () => {
    await contributionLimitConfig.waitForInitialization()
    contributionLimitConfig.unsubscribe()
  })
  afterAll(async () => {
    await closeScopedDynamicConfigContext([contributionLimitConfig])
  })
  it('refuses absent or mismatched authority before claiming admission', async () => {
    const args = await input()
    await expect(
      admitDelegatedContribution({ ...args, authority: undefined as never }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      admitDelegatedContribution({
        ...args,
        authority: { kind: 'delegated', credentialOwnerId: crypto.randomUUID() },
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(admitDelegatedContribution(args)).resolves.toHaveProperty('post.id')
  })

  it('returns a concurrent claim with the REST code and retry delay', async () => {
    const args = await input()
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const first = admitDelegatedContribution({
      ...args,
      beforeCapacity: async () => {
        started.resolve()
        await release.promise
      },
    })
    await started.promise
    try {
      await expect(admitDelegatedContribution(args)).rejects.toMatchObject({
        code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
        status: 409,
        retryAfterSeconds: expect.any(Number),
      })
    } finally {
      release.resolve()
    }
    const result = await first
    expect(await admitDelegatedContribution(args)).toEqual(result)
  })

  it('charges the credential owner budget and keeps the administrator exemption', async () => {
    const args = await input()
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      topic_recommendation_plus_short_limit: 1,
    })
    await insertLegacyContributionAdmissionConsumptionForTest({
      actorId: args.currentUser.id,
      source: args.source,
    })
    await expect(admitDelegatedContribution(args)).rejects.toMatchObject({
      code: 'CONTRIBUTION_QUOTA_EXCEEDED',
      status: 429,
    })
    await expect(
      admitDelegatedContribution({
        ...args,
        currentUser: { ...args.currentUser, roles: ['administrator'] },
      }),
    ).resolves.toHaveProperty('post.id')
  })
})
