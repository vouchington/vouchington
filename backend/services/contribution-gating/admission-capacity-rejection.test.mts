import { describe, expect, it } from 'vitest'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import {
  RejectedContributionAdmissionCapacityError,
  runContributionAdmissionCapacityCheckOrReject,
} from './admission-capacity-rejection.mts'

describe('runContributionAdmissionCapacityCheckOrReject', () => {
  it('wraps a quota rejection and retains its original reason', async () => {
    const quotaError = Object.assign(new Error('quota exhausted'), {
      code: CONTRIBUTION_QUOTA_EXCEEDED,
    })

    await expect(
      runContributionAdmissionCapacityCheckOrReject(async () => Promise.reject(quotaError)),
    ).rejects.toMatchObject({
      constructor: RejectedContributionAdmissionCapacityError,
      reason: quotaError,
    })
  })

  it('rethrows an unrelated check failure without changing its identity', async () => {
    const failure = new Error('database unavailable')

    await expect(
      runContributionAdmissionCapacityCheckOrReject(async () => Promise.reject(failure)),
    ).rejects.toBe(failure)
  })
})
