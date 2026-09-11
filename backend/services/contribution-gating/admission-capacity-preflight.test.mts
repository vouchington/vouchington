import { describe, expect, it, vi } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getContributionAdmissionReservationStateForTest,
} from '@voucha/test-helpers'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import { runContributionAdmission } from './admission.mts'
import type { ContributionPolicy } from './policy.mts'

const LIMIT_ONE_POLICY: ContributionPolicy = {
  global: {
    short: { limit: 1, windowSeconds: 3_600 },
    daily: { limit: 1, windowSeconds: 86_400 },
  },
  type: {
    short: { limit: 1, windowSeconds: 3_600 },
    daily: { limit: 1, windowSeconds: 86_400 },
  },
}

describe('contribution admission capacity preflight', () => {
  it('rejects exhausted capacity before running challenge or mutation work', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
      source: 'discussion',
      policy: LIMIT_ONE_POLICY,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })

    const idempotencyKey = crypto.randomUUID()
    const beforeCommit = vi.fn<() => Promise<void>>(async () => undefined)
    const execute = vi.fn<() => Promise<{ post: { id: string } }>>(async () => ({
      post: { id: crypto.randomUUID() },
    }))
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent: { request: crypto.randomUUID() },
        source: 'discussion',
        policy: LIMIT_ONE_POLICY,
        beforeCommit,
        execute,
      }),
    ).rejects.toMatchObject({ code: CONTRIBUTION_QUOTA_EXCEEDED, status: 429 })

    expect(beforeCommit).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
    await expect(
      getContributionAdmissionReservationStateForTest({ actorId: user.id, idempotencyKey }),
    ).resolves.toBeNull()
  })
})
