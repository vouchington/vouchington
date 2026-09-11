import { describe, expect, it, vi } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getContributionAdmissionReservationStateForTest,
} from '@voucha/test-helpers'
import { runContributionAdmission } from './admission.mts'
import type { ContributionPolicy } from './policy.mts'

function policy(limit: number): ContributionPolicy {
  return {
    global: {
      short: { limit, windowSeconds: 3_600 },
      daily: { limit, windowSeconds: 86_400 },
    },
    type: {
      short: { limit, windowSeconds: 3_600 },
      daily: { limit, windowSeconds: 86_400 },
    },
  }
}

describe('contribution admission transaction boundaries', () => {
  it('rejects a committed response without a UUID post identifier', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { request: crypto.randomUUID() },
        execute: async () => ({ post: { id: 'not-a-uuid' } }),
      }),
    ).rejects.toThrow('Contribution admission response must include a UUID post id')
  })

  it('discards a capacity-rejected reservation before any mutation', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const limits = policy(1)
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
      source: 'discussion',
      policy: limits,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    const idempotencyKey = crypto.randomUUID()
    const beforeCommit = vi.fn<() => Promise<void>>(async () => undefined)
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent: { request: crypto.randomUUID() },
        source: 'discussion',
        policy: limits,
        beforeCommit,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).rejects.toMatchObject({ code: 'CONTRIBUTION_QUOTA_EXCEEDED', status: 429 })
    expect(beforeCommit).not.toHaveBeenCalled()
    await expect(
      getContributionAdmissionReservationStateForTest({ actorId: user.id, idempotencyKey }),
    ).resolves.toBeNull()
  })
})
