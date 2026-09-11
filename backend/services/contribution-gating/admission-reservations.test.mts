import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getContributionAdmissionAuditForTest,
} from '@voucha/test-helpers'
import { runContributionAdmission } from './admission.mts'
import type { ContributionPolicy } from './policy.mts'

function policy(globalLimit: number, typeLimit: number): ContributionPolicy {
  return {
    global: {
      short: { limit: globalLimit, windowSeconds: 3_600 },
      daily: { limit: globalLimit, windowSeconds: 86_400 },
    },
    type: {
      short: { limit: typeLimit, windowSeconds: 3_600 },
      daily: { limit: typeLimit, windowSeconds: 86_400 },
    },
  }
}

describe('contribution admission reservations', () => {
  it('refreshes reclaimed policy audit while preserving committed replay audit', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const intent = { request: crypto.randomUUID() }
    const initialAudit = {
      route: 'posts.create',
      scope: 'community',
      source: 'discussion' as const,
      postType: 'discussion',
      policyRevision: 'free-dynamic-policy',
    }
    const retriedAudit = { ...initialAudit, policyRevision: 'plus-dynamic-policy' }

    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent,
        source: 'discussion',
        policy: policy(1, 1),
        audit: initialAudit,
        execute: async () => {
          throw new Error('retry under refreshed policy')
        },
      }),
    ).rejects.toThrow('retry under refreshed policy')
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
      source: 'discussion',
      policy: policy(2, 2),
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })

    const retry = await runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      source: 'discussion',
      policy: policy(2, 2),
      audit: retriedAudit,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    expect(retry).toMatchObject({ kind: 'created' })
    expect(
      await getContributionAdmissionAuditForTest({ actorId: user.id, idempotencyKey }),
    ).toEqual(retriedAudit)

    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent,
        source: 'discussion',
        policy: policy(3, 3),
        audit: { ...retriedAudit, policyRevision: 'later-policy-revision' },
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toMatchObject({ kind: 'replay' })
    expect(
      await getContributionAdmissionAuditForTest({ actorId: user.id, idempotencyKey }),
    ).toEqual(retriedAudit)
  })
})
