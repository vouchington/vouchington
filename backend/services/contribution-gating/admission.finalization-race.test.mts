import { describe, expect, it, vi } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  expireContributionAdmissionClaimForTest,
  getContributionAdmissionClaimExpiryForTest,
  getContributionAdmissionReplayRetentionForTest,
  insertTestTopic,
  setContributionAdmissionExpiryForTest,
} from '@voucha/test-helpers'
import { runContributionAdmission } from './admission.mts'
import { preparePostWithCommunityReviews } from '../posts/create.mts'
import { reconcilePostCategoryFinalizations } from '../posts/post-category-finalizations.mts'
import { executePreparedContribution } from './prepared-contribution.mts'
import { CONTRIBUTION_ADMISSION_CLAIM_SECONDS } from './config.mts'
import { CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES } from './admission-replay-retention.mts'

const MINIMUM_REPLAY_RETENTION_SECONDS = CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES * 60 - 30

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('contribution admission finalization', () => {
  it('publishes the transaction-captured response instead of a mutable finalizer replacement', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const intent = { request: crypto.randomUUID() }
    const postId = crypto.randomUUID()
    const finalizationStarted = deferred<void>()
    const releaseFinalization = deferred<void>()
    const first = runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      execute: query =>
        executePreparedContribution(query, async () => ({
          response: { post: { id: postId, post_related_topics: [] as string[] } },
          finalize: async () => {
            finalizationStarted.resolve()
            await releaseFinalization.promise
            return { post: { id: postId, post_related_topics: ['topic-id'] } }
          },
        })),
    })
    await finalizationStarted.promise
    await setContributionAdmissionExpiryForTest({
      actorId: user.id,
      idempotencyKey,
      expiresInSeconds: 300,
    })

    const duplicate = await runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    expect(duplicate).toMatchObject({ kind: 'in_progress', retryAfterSeconds: expect.any(Number) })
    const retryAfterSeconds = duplicate.kind === 'in_progress' ? duplicate.retryAfterSeconds : 0
    expect(retryAfterSeconds).toBeGreaterThan(0)
    expect(retryAfterSeconds).toBeLessThanOrEqual(CONTRIBUTION_ADMISSION_CLAIM_SECONDS)
    const pendingRetention = await getContributionAdmissionReplayRetentionForTest({
      actorId: user.id,
      idempotencyKey,
    })
    expect(pendingRetention?.secondsUntilExpiry).toBeGreaterThan(MINIMUM_REPLAY_RETENTION_SECONDS)
    expect(pendingRetention?.retentionExpiresAt).toEqual(pendingRetention?.expiresAt)

    releaseFinalization.resolve()
    await expect(first).resolves.toEqual({
      kind: 'created',
      response: { post: { id: postId, post_related_topics: [] } },
    })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toEqual({
      kind: 'replay',
      response: { post: { id: postId, post_related_topics: [] } },
    })
  })

  it('recovers a markerless committed response after its claim expires', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const intent = { request: crypto.randomUUID() }
    const response = { post: { id: crypto.randomUUID() } }
    const finalizationStarted = deferred<void>()
    const releaseFinalization = deferred<void>()
    const first = runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      execute: query =>
        executePreparedContribution(query, async () => ({
          response,
          finalize: async () => {
            finalizationStarted.resolve()
            await releaseFinalization.promise
          },
        })),
    })
    await finalizationStarted.promise
    await expireContributionAdmissionClaimForTest({ actorId: user.id, idempotencyKey })
    releaseFinalization.resolve()
    await expect(first).resolves.toEqual({ kind: 'in_progress', retryAfterSeconds: 1 })
    await setContributionAdmissionExpiryForTest({
      actorId: user.id,
      idempotencyKey,
      expiresInSeconds: 300,
    })

    const execute = vi.fn<() => Promise<{ post: { id: string } }>>(async () => ({
      post: { id: crypto.randomUUID() },
    }))
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent,
        execute,
      }),
    ).resolves.toEqual({
      kind: 'replay',
      response,
    })
    expect(execute).not.toHaveBeenCalled()
    const retention = await getContributionAdmissionReplayRetentionForTest({
      actorId: user.id,
      idempotencyKey,
    })
    expect(retention?.secondsUntilExpiry).toBeGreaterThan(MINIMUM_REPLAY_RETENTION_SECONDS)
    expect(retention?.retentionExpiresAt).toEqual(retention?.expiresAt)
  })

  it('returns the generation-fenced category projection to the initial caller', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `Initial admission topic ${suffix}`,
      slug: `initial-admission-topic-${suffix}`,
      createdById: user.id,
    })
    const idempotencyKey = crypto.randomUUID()
    const intent = { request: suffix }
    const create = () =>
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent,
        execute: query =>
          executePreparedContribution(query, () =>
            preparePostWithCommunityReviews(
              user,
              {
                title: `Initial admission post ${suffix}`,
                categories: [{ type: 'topic', topic_id: topicId }],
              },
              null,
              { query },
            ),
          ),
      })

    const first = await create()
    expect(first).toMatchObject({
      kind: 'created',
      response: {
        post: {
          post_related_topics: [expect.objectContaining({ id: topicId })],
        },
      },
    })
    if (first.kind !== 'created') throw new Error('expected first admission to create')
    await expect(create()).resolves.toEqual({ kind: 'replay', response: first.response })
  })

  it('repairs an abandoned pre-finalization replay from durable create state after claim expiry', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `Admission replay topic ${suffix}`,
      slug: `admission-replay-topic-${suffix}`,
      createdById: user.id,
    })
    const idempotencyKey = crypto.randomUUID()
    const intent = { request: suffix }
    const created = await runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      execute: async query =>
        (
          await preparePostWithCommunityReviews(
            user,
            {
              title: `Admission replay post ${suffix}`,
              categories: [{ type: 'topic', topic_id: topicId }],
            },
            null,
            { query },
          )
        ).response.post,
    })
    expect(created).toEqual({ kind: 'in_progress', retryAfterSeconds: 1 })
    await expect(
      getContributionAdmissionClaimExpiryForTest({ actorId: user.id, idempotencyKey }),
    ).resolves.toBeNull()

    await expireContributionAdmissionClaimForTest({ actorId: user.id, idempotencyKey })
    await setContributionAdmissionExpiryForTest({
      actorId: user.id,
      idempotencyKey,
      expiresInSeconds: 300,
    })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toEqual({ kind: 'in_progress', retryAfterSeconds: 1 })
    const pendingRetention = await getContributionAdmissionReplayRetentionForTest({
      actorId: user.id,
      idempotencyKey,
    })
    expect(pendingRetention?.secondsUntilExpiry).toBeGreaterThan(MINIMUM_REPLAY_RETENTION_SECONDS)
    expect(pendingRetention?.retentionExpiresAt).toEqual(pendingRetention?.expiresAt)

    await reconcilePostCategoryFinalizations()
    const replay = await runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    expect(replay).toMatchObject({
      kind: 'replay',
      response: { post_related_topics: [expect.objectContaining({ id: topicId })] },
    })
  })
})
