import { describe, expect, it, vi } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import {
  assertContributionAdmissionCapacityOrReject,
  RejectedContributionAdmissionCapacityError,
} from './admission-capacity-rejection.mts'
import type { ContributionPolicy } from './policy.mts'

const POLICY: ContributionPolicy = {
  global: {
    short: { limit: 1, windowSeconds: 3_600 },
    daily: { limit: 1, windowSeconds: 86_400 },
  },
  type: {
    short: { limit: 1, windowSeconds: 3_600 },
    daily: { limit: 1, windowSeconds: 86_400 },
  },
}

function failingQuery(failure: Error): TransactionQuery {
  return vi.fn<() => Promise<never>>(async () =>
    Promise.reject(failure),
  ) as unknown as TransactionQuery
}

describe('assertContributionAdmissionCapacityOrReject', () => {
  it('wraps a quota rejection and retains its original reason', async () => {
    const quotaError = Object.assign(new Error('quota exhausted'), {
      code: CONTRIBUTION_QUOTA_EXCEEDED,
    })

    await expect(
      assertContributionAdmissionCapacityOrReject(
        failingQuery(quotaError),
        crypto.randomUUID(),
        'discussion',
        POLICY,
      ),
    ).rejects.toMatchObject({
      constructor: RejectedContributionAdmissionCapacityError,
      reason: quotaError,
    })
  })

  it('rethrows an unrelated check failure without changing its identity', async () => {
    const failure = new Error('database unavailable')

    await expect(
      assertContributionAdmissionCapacityOrReject(
        failingQuery(failure),
        crypto.randomUUID(),
        'discussion',
        POLICY,
      ),
    ).rejects.toBe(failure)
  })
})
