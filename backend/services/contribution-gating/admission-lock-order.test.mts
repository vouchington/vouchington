import { describe, expect, it, vi } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  expireContributionAdmissionClaimForTest,
  insertContributionAdmissionFkLockedTopicForTest,
} from '@voucha/test-helpers'
import { runContributionAdmission } from './admission.mts'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('contribution admission lock order', () => {
  it('allows same-actor commits after mutations acquire foreign-key locks', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const mutationsReady = deferred<void>()
    let readyCount = 0
    const create = () =>
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { request: crypto.randomUUID() },
        execute: async query => {
          const topicId = await insertContributionAdmissionFkLockedTopicForTest(query, user.id)
          readyCount += 1
          if (readyCount === 2) mutationsReady.resolve()
          await mutationsReady.promise
          return { post: { id: topicId } }
        },
      })

    const [first, second] = await Promise.all([create(), create()])

    expect(first).toMatchObject({ kind: 'created' })
    expect(second).toMatchObject({ kind: 'created' })
    if (first.kind !== 'created' || second.kind !== 'created')
      throw new Error('expected both admissions to create')
    expect(first.response.post.id).not.toBe(second.response.post.id)
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
      execute: async () => {
        mutationStarted.resolve()
        await releaseMutation.promise
        return originalResponse
      },
    })
    await mutationStarted.promise
    await expireContributionAdmissionClaimForTest(input)

    const retryResponse = { post: { id: crypto.randomUUID() } }
    const retryStarted = deferred<void>()
    const releaseRetry = deferred<void>()
    const retryMutation = vi.fn<() => Promise<typeof retryResponse>>(async () => {
      retryStarted.resolve()
      await releaseRetry.promise
      return retryResponse
    })
    const retry = runContributionAdmission({ ...input, execute: retryMutation })
    await retryStarted.promise
    releaseMutation.resolve()

    await expect(first).resolves.toEqual({ kind: 'in_progress', retryAfterSeconds: 1 })
    releaseRetry.resolve()
    await expect(retry).resolves.toEqual({ kind: 'created', response: retryResponse })
    expect(retryMutation).toHaveBeenCalledOnce()
  })
})
