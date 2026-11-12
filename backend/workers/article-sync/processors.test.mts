import { randomUUID } from 'node:crypto'
import { GlideClient } from '@valkey/valkey-glide'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { articleSyncPubSub, type ArticleSyncStatus } from '@data-stores/valkey-pubsub'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { useArticleBucket } from '@voucha/test-helpers/article-sync-fixtures'
import { useMissingS3Bucket } from '@voucha/test-helpers/missing-s3-bucket'
import { processArticleSync } from './processors.mts'

const restoreMethods: Array<() => void> = []

describe('article-sync processors', () => {
  afterEach(() => {
    while (restoreMethods.length) restoreMethods.pop()!()
  })

  it('resolves a real user and returns the empty article sync result', async () => {
    const user = await createTestUser()
    await useArticleBucket()

    await expect(processArticleSync(user.id)).resolves.toEqual({
      results: [],
      summary: { created: 0, updated: 0, skipped: 0, errored: 0 },
    })
  })

  it('throws UnrecoverableError when the user does not exist', async () => {
    const missingUserId = randomUUID()

    await expect(processArticleSync(missingUserId)).rejects.toThrow(UnrecoverableError)
    await expect(processArticleSync(missingUserId)).rejects.toThrow(
      `User ${missingUserId} not found`,
    )
  })

  it('publishes completed status on the real pub/sub channel when jobId is provided', async () => {
    const user = await createTestUser()
    await useArticleBucket()
    const jobId = randomUUID()
    const result = {
      results: [],
      summary: { created: 0, updated: 0, skipped: 0, errored: 0 },
    }

    const published = await withPublishedStatus(jobId, async () => {
      await expect(processArticleSync(user.id, jobId)).resolves.toEqual(result)
    })
    expect(published).toEqual({ status: 'completed', result })
  })

  it('publishes failed status on S3 listing failure and rethrows it', async () => {
    const user = await createTestUser()
    useMissingS3Bucket('assets')
    const jobId = randomUUID()

    let failure: unknown
    const published = await withPublishedStatus(jobId, async () => {
      failure = await processArticleSync(user.id, jobId).catch((err: unknown) => err)
    })
    expect(failure).toMatchObject({ name: 'NoSuchBucket' })
    expect(published).toEqual({ status: 'failed', error: (failure as Error).message })
  })

  it('retries a transient terminal publish failure before returning the sync result', async () => {
    const user = await createTestUser()
    await useArticleBucket()
    const jobId = randomUUID()
    const publish = interceptOwnedPublish(jobId, attempt =>
      attempt === 1 ? Promise.reject(new Error('transient')) : null,
    )

    const published = await withPublishedStatus(jobId, async () => {
      await expect(processArticleSync(user.id, jobId)).resolves.toEqual(emptyResult())
    })
    expect(published).toEqual({ status: 'completed', result: emptyResult() })
    expect(publish()).toHaveLength(2)
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
  })

  it('reports a failed terminal publish after three attempts without undoing the sync', async () => {
    const user = await createTestUser()
    await useArticleBucket()
    const jobId = randomUUID()
    const publishFailure = 'pub/sub unavailable'
    const rejectedPublish = vi.fn<() => Promise<number>>().mockRejectedValue(publishFailure)
    const publish = interceptOwnedPublish(jobId, rejectedPublish)

    await expect(processArticleSync(user.id, jobId)).resolves.toEqual(emptyResult())
    expect(publish()).toHaveLength(3)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: publishFailure }),
      expect.anything(),
    )
  })
})

function emptyResult() {
  return { results: [], summary: { created: 0, updated: 0, skipped: 0, errored: 0 } }
}

function interceptOwnedPublish(
  jobId: string,
  answer: (attempt: number) => Promise<number> | null,
): () => unknown[] {
  const original = GlideClient.prototype.publish
  const channel = `article-sync:status:${jobId}`
  const attempts: unknown[] = []
  GlideClient.prototype.publish = function (this: GlideClient, message, destination) {
    if (destination === channel) {
      attempts.push(message)
      const response = answer(attempts.length)
      if (response) return response
    }
    return Reflect.apply(original, this, [message, destination])
  }
  restoreMethods.push(() => {
    GlideClient.prototype.publish = original
  })
  return () => attempts
}

/** Runs the job with a live subscription and returns the terminal status it published. */
async function withPublishedStatus(
  jobId: string,
  run: () => Promise<void>,
): Promise<ArticleSyncStatus> {
  const subscription = await articleSyncPubSub.subscribe(jobId)
  const published = Promise.withResolvers<ArticleSyncStatus>()
  subscription.setHandler(value => published.resolve(value))
  try {
    await run()
    return await published.promise
  } finally {
    await subscription.close()
  }
}
