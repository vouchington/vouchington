import { describe, expect, it, vi } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  ensureTestAdmittedPostIdentity,
  executeTestAdmittedPost,
  expireContributionAdmissionClaimForTest,
} from '@voucha/test-helpers'
import { runContributionAdmission } from './admission.mts'
import { CONTRIBUTION_ADMISSION_CLAIM_SECONDS } from './config.mts'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('contribution admission lock order', () => {
  it('rejects a concurrent same-user admission as in progress until the first finishes', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const mutationStarted = deferred<void>()
    const releaseMutation = deferred<void>()
    const first = runContributionAdmission({
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
      execute: async query => {
        mutationStarted.resolve()
        await releaseMutation.promise
        return executeTestAdmittedPost(query)
      },
    })
    await mutationStarted.promise

    const concurrent = await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
      execute: executeTestAdmittedPost,
    })
    expect(concurrent.kind).toBe('in_progress')
    if (concurrent.kind !== 'in_progress') throw new Error('expected in_progress')
    expect(concurrent.retryAfterSeconds).toBeGreaterThanOrEqual(1)
    expect(concurrent.retryAfterSeconds).toBeLessThanOrEqual(CONTRIBUTION_ADMISSION_CLAIM_SECONDS)

    releaseMutation.resolve()
    await expect(first).resolves.toMatchObject({ kind: 'created' })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { request: crypto.randomUUID() },
        execute: executeTestAdmittedPost,
      }),
    ).resolves.toMatchObject({ kind: 'created' })
  })

  it('lets another request by the same user take over an expired lease and fences the original', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const original = {
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
    }
    const mutationStarted = deferred<void>()
    const releaseMutation = deferred<void>()
    const originalResponse = { post: { id: crypto.randomUUID() } }
    const first = runContributionAdmission({
      ...original,
      execute: async query => {
        mutationStarted.resolve()
        await releaseMutation.promise
        await ensureTestAdmittedPostIdentity(query, originalResponse.post.id)
        return originalResponse
      },
    })
    await mutationStarted.promise
    await expireContributionAdmissionClaimForTest(original)

    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { request: crypto.randomUUID() },
        execute: executeTestAdmittedPost,
      }),
    ).resolves.toMatchObject({ kind: 'created' })
    releaseMutation.resolve()
    await expect(first).resolves.toEqual({ kind: 'in_progress', retryAfterSeconds: 1 })
  })

  it('serializes expired-lease takeover without deadlocking the original owner', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const input = {
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
    }
    const mutationStarted = deferred<void>()
    const releaseMutation = deferred<void>()
    const originalResponse = { post: { id: crypto.randomUUID() } }
    const first = runContributionAdmission({
      ...input,
      execute: async query => {
        mutationStarted.resolve()
        await releaseMutation.promise
        await ensureTestAdmittedPostIdentity(query, originalResponse.post.id)
        return originalResponse
      },
    })
    await mutationStarted.promise
    await expireContributionAdmissionClaimForTest(input)

    const retryResponse = { post: { id: crypto.randomUUID() } }
    const retryStarted = deferred<void>()
    const releaseRetry = deferred<void>()
    const retryMutation = vi.fn<(query: TransactionQuery) => Promise<typeof retryResponse>>(
      async query => {
        retryStarted.resolve()
        await releaseRetry.promise
        await ensureTestAdmittedPostIdentity(query, retryResponse.post.id)
        return retryResponse
      },
    )
    const retry = runContributionAdmission({ ...input, execute: retryMutation })
    await retryStarted.promise
    releaseMutation.resolve()

    await expect(first).resolves.toEqual({ kind: 'in_progress', retryAfterSeconds: 1 })
    releaseRetry.resolve()
    await expect(retry).resolves.toEqual({ kind: 'created', response: retryResponse })
    expect(retryMutation).toHaveBeenCalledOnce()
  })
})
