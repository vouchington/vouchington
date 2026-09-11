import { describe, expect, it, vi } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  expireContributionAdmissionForTest,
  getContributionAdmissionConsumptionCountForTest,
  getContributionAdmissionReplayRetentionForTest,
  setContributionAdmissionExpiryForTest,
} from '@voucha/test-helpers'
import { CONTRIBUTION_QUOTA_EXCEEDED, IDEMPOTENCY_KEY_REUSED } from '@modules/on-error/error-codes'
import { pruneExpiredContributionAdmissions, runContributionAdmission } from './admission.mts'
import { CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES } from './admission-replay-retention.mts'
import type { ContributionPolicy } from './policy.mts'

const MINIMUM_REPLAY_RETENTION_SECONDS = CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES * 60 - 30

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

describe('contribution admission retention', () => {
  it('extends both server replay boundaries for an exact near-expiry replay', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const intent = { request: crypto.randomUUID() }
    const first = await runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    if (first.kind !== 'created') throw new Error('expected initial admission to create')
    const initialRetention = await getContributionAdmissionReplayRetentionForTest({
      actorId: user.id,
      idempotencyKey,
    })
    expect(initialRetention?.secondsUntilExpiry).toBeGreaterThan(MINIMUM_REPLAY_RETENTION_SECONDS)
    expect(initialRetention?.retentionExpiresAt).toEqual(initialRetention?.expiresAt)
    await setContributionAdmissionExpiryForTest({
      actorId: user.id,
      idempotencyKey,
      expiresInSeconds: 60,
    })

    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toEqual({ kind: 'replay', response: first.response })

    const retention = await getContributionAdmissionReplayRetentionForTest({
      actorId: user.id,
      idempotencyKey,
    })
    expect(retention).toMatchObject({ secondsUntilExpiry: expect.any(Number) })
    expect(retention?.secondsUntilExpiry).toBeGreaterThan(MINIMUM_REPLAY_RETENTION_SECONDS)
    expect(retention?.retentionExpiresAt).toEqual(retention?.expiresAt)

    await setContributionAdmissionExpiryForTest({
      actorId: user.id,
      idempotencyKey,
      expiresInSeconds: CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES * 60 + 600,
    })
    const laterRetention = await getContributionAdmissionReplayRetentionForTest({
      actorId: user.id,
      idempotencyKey,
    })
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    const preservedRetention = await getContributionAdmissionReplayRetentionForTest({
      actorId: user.id,
      idempotencyKey,
    })
    expect(preservedRetention?.expiresAt.getTime()).toBeGreaterThanOrEqual(
      laterRetention?.expiresAt.getTime() ?? Number.POSITIVE_INFINITY,
    )
    expect(preservedRetention?.retentionExpiresAt).toEqual(preservedRetention?.expiresAt)
  })

  it('does not extend a near-expiry replay with a mismatched intent', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent: { request: 'original' },
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    await setContributionAdmissionExpiryForTest({
      actorId: user.id,
      idempotencyKey,
      expiresInSeconds: 300,
    })

    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent: { request: 'changed' },
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).rejects.toMatchObject({ code: IDEMPOTENCY_KEY_REUSED, status: 409 })

    const retention = await getContributionAdmissionReplayRetentionForTest({
      actorId: user.id,
      idempotencyKey,
    })
    expect(retention).toMatchObject({ secondsUntilExpiry: expect.any(Number) })
    expect(retention?.secondsUntilExpiry).toBeLessThan(300)
  })

  it('replaces an expired replay before its new quota consumption commits', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const key = crypto.randomUUID()
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: key,
      intent: { request: 'first' },
      source: 'discussion',
      policy: policy(2),
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    await expireContributionAdmissionForTest({ actorId: user.id, idempotencyKey: key })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: key,
        intent: { request: 'second' },
        source: 'discussion',
        policy: policy(2),
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toMatchObject({ kind: 'created' })
    await expect(
      getContributionAdmissionConsumptionCountForTest(user.id, 'discussion'),
    ).resolves.toBe(2)
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { request: 'third' },
        source: 'discussion',
        policy: policy(2),
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).rejects.toMatchObject({ code: CONTRIBUTION_QUOTA_EXCEEDED, status: 429 })
  })

  it('does not retain a failed pre-commit challenge reservation', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    let mutationExecuted = false
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent: { request: 'rejected-challenge' },
        beforeCommit: async () => {
          throw new Error('challenge rejected')
        },
        execute: async () => {
          mutationExecuted = true
          return { post: { id: crypto.randomUUID() } }
        },
      }),
    ).rejects.toThrow('challenge rejected')
    expect(mutationExecuted).toBe(false)
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent: { request: 'fresh-challenge' },
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toMatchObject({ kind: 'created' })
  })

  it('does not retain reservations rejected before mutation by capacity', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: 'capacity-consumer' },
      source: 'discussion',
      policy: policy(1),
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })

    const rejectedKey = crypto.randomUUID()
    let mutationExecutions = 0
    const reject = (intent: unknown) =>
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: rejectedKey,
        intent,
        source: 'discussion',
        policy: policy(1),
        execute: async () => {
          mutationExecutions += 1
          return { post: { id: crypto.randomUUID() } }
        },
      })

    await expect(reject({ request: 'first-rejected-intent' })).rejects.toMatchObject({
      code: CONTRIBUTION_QUOTA_EXCEEDED,
      status: 429,
    })
    await expect(reject({ request: 'changed-rejected-intent' })).rejects.toMatchObject({
      code: CONTRIBUTION_QUOTA_EXCEEDED,
      status: 429,
    })
    expect(mutationExecutions).toBe(0)
  })

  it('replays a committed response without rerunning its pre-commit challenge', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const intent = { request: 'replay-without-challenge' }
    const first = await runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      beforeCommit: async () => undefined,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    if (first.kind !== 'created') throw new Error('expected first admission to create')

    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent,
        beforeCommit: async () => {
          throw new Error('replay challenge must not run')
        },
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toEqual({ kind: 'replay', response: first.response })
  })

  it('uses the database clock when deciding whether a replay has expired', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent: { request: 'original' },
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    await setContributionAdmissionExpiryForTest({
      actorId: user.id,
      idempotencyKey,
      expiresInSeconds: 300,
    })

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 600_000)
    try {
      await pruneExpiredContributionAdmissions()
      await expect(
        runContributionAdmission({
          actorId: user.id,
          idempotencyKey,
          intent: { request: 'changed' },
          execute: async () => ({ post: { id: crypto.randomUUID() } }),
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 })
    } finally {
      vi.useRealTimers()
    }
  })
})
