import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  executeTestAdmittedPost,
  expireContributionAdmissionForTest,
  getContributionAdmissionConsumptionCountForTest,
  getContributionAdmissionConsumptionModeForTest,
} from '@voucha/test-helpers'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import { runContributionAdmission } from './admission.mts'
import { MAX_CONTRIBUTION_POLICY_WINDOW_SECONDS } from './admission-quota.mts'
import { CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES } from './admission-replay-retention.mts'
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

describe('contribution admission replay retention and quota consumptions', () => {
  it('keeps every replay, and so its quota consumption, longer than the longest policy window', () => {
    // A quota consumption is deleted with its reservation, so no consumption may be dropped while a
    // policy window can still count it.
    expect(CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES * 60).toBeGreaterThan(
      MAX_CONTRIBUTION_POLICY_WINDOW_SECONDS,
    )
  })

  it('replaces an expired replay and its quota consumption when the key is reused', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const key = crypto.randomUUID()
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: key,
      intent: { request: 'first' },
      source: 'discussion',
      policy: policy(2),
      execute: executeTestAdmittedPost,
    })
    await expireContributionAdmissionForTest({ actorId: user.id, idempotencyKey: key })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: key,
        intent: { request: 'second' },
        source: 'discussion',
        policy: policy(2),
        execute: executeTestAdmittedPost,
      }),
    ).resolves.toMatchObject({ kind: 'created' })
    // The expired replay's consumption is deleted with its reservation; only the new one remains.
    await expect(
      getContributionAdmissionConsumptionCountForTest(user.id, 'discussion'),
    ).resolves.toBe(1)
    await expect(
      getContributionAdmissionConsumptionModeForTest({ actorId: user.id, idempotencyKey: key }),
    ).resolves.toBe('all_windows')
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { request: 'third' },
        source: 'discussion',
        policy: policy(2),
        execute: executeTestAdmittedPost,
      }),
    ).resolves.toMatchObject({ kind: 'created' })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { request: 'fourth' },
        source: 'discussion',
        policy: policy(2),
        execute: executeTestAdmittedPost,
      }),
    ).rejects.toMatchObject({ code: CONTRIBUTION_QUOTA_EXCEEDED, status: 429 })
  })
})
