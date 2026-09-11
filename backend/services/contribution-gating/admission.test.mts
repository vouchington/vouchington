import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createExpiredContributionAdmissionClaimForTest,
  createTestUserWithAge,
  expireContributionAdmissionForTest,
  getContributionAdmissionReservationStateForTest,
} from '@voucha/test-helpers'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import {
  canonicalizeAdmissionIntent,
  pruneExpiredContributionAdmissions,
  resolveAdmissionIdentity,
  runContributionAdmission,
} from './admission.mts'
import { executePreparedContribution } from './prepared-contribution.mts'
import { CONTRIBUTION_ADMISSION_CLAIM_SECONDS } from './config.mts'
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('contribution admission identity', () => {
  it('canonicalizes equivalent object intents identically', () => {
    expect(canonicalizeAdmissionIntent({ title: 'hello', tags: ['a', 'b'] })).toBe(
      canonicalizeAdmissionIntent({ tags: ['a', 'b'], title: 'hello' }),
    )
  })

  it('mints a non-replayable identity when compatibility clients omit the header', () => {
    const first = resolveAdmissionIdentity(null)
    const second = resolveAdmissionIdentity(null)
    expect(first.callerSupplied).toBe(false)
    expect(second.callerSupplied).toBe(false)
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey)
  })

  it('commits once and replays the exact response for the same actor and intent', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const key = crypto.randomUUID()
    const intent = { post_type: 'discussion', title: crypto.randomUUID() }
    const create = () =>
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: key,
        intent,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      })
    const first = await create()
    const second = await create()
    expect(first).toMatchObject({ kind: 'created' })
    if (first.kind !== 'created') throw new Error('expected first admission to create')
    expect(second).toEqual({ kind: 'replay', response: first.response })
  })

  it('persists the transaction-captured response instead of a finalizer replacement', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const postId = crypto.randomUUID()
    const intent = { request: crypto.randomUUID() }
    const create = () =>
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent,
        execute: query =>
          executePreparedContribution(query, async () => ({
            response: { post: { id: postId, post_related_topics: [] as string[] } },
            finalize: async () => ({
              post: { id: postId, post_related_topics: ['topic-id'] },
            }),
          })),
      })

    const first = await create()
    if (first.kind !== 'created') throw new Error('expected first admission to create')
    expect(first.response.post.post_related_topics).toEqual([])

    const replay = await create()
    expect(replay).toEqual({ kind: 'replay', response: first.response })
  })

  it('rejects a reused key with a different intent before executing a second mutation', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const key = crypto.randomUUID()
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: key,
      intent: { request: 'first' },
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: key,
        intent: { request: 'second' },
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 })
  })

  it('returns in-progress for a live duplicate, then replays after the creator commits', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const key = crypto.randomUUID()
    const intent = { post_type: 'discussion', title: crypto.randomUUID() }
    const pending = deferred<{ post: { id: string } }>()
    const started = deferred<void>()
    const first = runContributionAdmission({
      actorId: user.id,
      idempotencyKey: key,
      intent,
      execute: () => {
        started.resolve()
        return pending.promise
      },
    })
    await started.promise
    const duplicate = await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: key,
      intent,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    expect(duplicate).toMatchObject({ kind: 'in_progress', retryAfterSeconds: expect.any(Number) })
    const retryAfterSeconds = duplicate.kind === 'in_progress' ? duplicate.retryAfterSeconds : 0
    expect(retryAfterSeconds).toBeGreaterThan(0)
    expect(retryAfterSeconds).toBeLessThanOrEqual(CONTRIBUTION_ADMISSION_CLAIM_SECONDS)
    const response = { post: { id: crypto.randomUUID() } }
    pending.resolve(response)
    await expect(first).resolves.toEqual({ kind: 'created', response })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: key,
        intent,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toEqual({ kind: 'replay', response })
  })

  it('keeps a failed mutation retryable without committing its response', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const input = {
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { title: crypto.randomUUID() },
    }
    await expect(
      runContributionAdmission({
        ...input,
        execute: async () => {
          throw new Error('injected failure')
        },
      }),
    ).rejects.toThrow('injected failure')
    await expect(
      getContributionAdmissionReservationStateForTest({
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
      }),
    ).resolves.toBe('retryable_failed')
    await expect(
      runContributionAdmission({
        ...input,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toMatchObject({ kind: 'created' })
  })

  it('enforces global and source-specific short and daily capacities atomically', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const limits = policy(2, 1)
    const create = (source: 'discussion' | 'topic_recommendation') =>
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { source, request: crypto.randomUUID() },
        source,
        policy: limits,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      })

    await expect(create('discussion')).resolves.toMatchObject({ kind: 'created' })
    await expect(create('discussion')).rejects.toMatchObject({
      code: CONTRIBUTION_QUOTA_EXCEEDED,
      status: 429,
    })
    await expect(create('topic_recommendation')).resolves.toMatchObject({ kind: 'created' })
    await expect(create('topic_recommendation')).rejects.toMatchObject({
      code: CONTRIBUTION_QUOTA_EXCEEDED,
      status: 429,
    })
  })

  it('does not consume capacity for a failed mutation or an abandoned lease', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const input = {
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
      source: 'discussion' as const,
      policy: policy(1, 1),
    }
    await expect(
      runContributionAdmission({
        ...input,
        execute: async () => {
          throw new Error('injected failure')
        },
      }),
    ).rejects.toThrow('injected failure')
    await expect(
      runContributionAdmission({
        ...input,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toMatchObject({ kind: 'created' })

    const reclaimKey = crypto.randomUUID()
    const reclaimIntent = { request: crypto.randomUUID() }
    await createExpiredContributionAdmissionClaimForTest({
      actorId: user.id,
      idempotencyKey: reclaimKey,
      intent: reclaimIntent,
    })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: reclaimKey,
        intent: reclaimIntent,
        source: 'discussion',
        policy: policy(-1, -1),
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toMatchObject({ kind: 'created' })
  })

  it('allows verified capacity exemptions while preserving exact replay', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const key = crypto.randomUUID()
    const input = {
      actorId: user.id,
      idempotencyKey: key,
      intent: { request: crypto.randomUUID() },
      source: 'discussion' as const,
      policy: policy(0, 0),
      capacityExempt: true,
    }
    const first = await runContributionAdmission({
      ...input,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    if (first.kind !== 'created') throw new Error('expected exempt admission to create')
    await expect(
      runContributionAdmission({
        ...input,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toEqual({ kind: 'replay', response: first.response })
  })

  it('retention pruning respects a lower bound on shared dirty-database rows', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const key = crypto.randomUUID()
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: key,
      intent: { request: 'retention' },
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    await expireContributionAdmissionForTest({ actorId: user.id, idempotencyKey: key })
    await expect(
      pruneExpiredContributionAdmissions(new Date(), 1, new Date(Date.now() + 60_000)),
    ).resolves.toBe(0)
    await expect(pruneExpiredContributionAdmissions(new Date(), 1)).resolves.toBe(1)
  })
})
