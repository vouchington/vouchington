import { randomUUID } from 'node:crypto'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { GlideClient } from '@valkey/valkey-glide'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { articleSyncPubSub, type ArticleSyncStatus } from '@data-stores/valkey-pubsub'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { processArticleSync } from './processors.mts'

const restoreMethods: Array<() => void> = []

describe('article-sync processors', () => {
  afterEach(() => {
    while (restoreMethods.length) restoreMethods.pop()!()
  })

  it('resolves a real user and returns the empty article sync result', async () => {
    const user = await createTestUser()
    const listCalls = mockArticleListResponse(() => Promise.resolve({ Contents: [] }))

    await expect(processArticleSync(user.id)).resolves.toEqual({
      results: [],
      summary: { created: 0, updated: 0, skipped: 0, errored: 0 },
    })
    expect(listCalls()).toBe(1)
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
    mockArticleListResponse(() => Promise.resolve({ Contents: [] }))
    const jobId = randomUUID()
    const result = {
      results: [],
      summary: { created: 0, updated: 0, skipped: 0, errored: 0 },
    }

    await withPublishedStatus(jobId, { status: 'completed', result }, async () => {
      await expect(processArticleSync(user.id, jobId)).resolves.toEqual(result)
    })
  })

  it('publishes failed status on S3 listing failure and rethrows it', async () => {
    const user = await createTestUser()
    const failure = new Error('article list unavailable')
    mockArticleListResponse(() => Promise.reject(failure))
    const jobId = randomUUID()

    await withPublishedStatus(jobId, { status: 'failed', error: failure.message }, async () => {
      await expect(processArticleSync(user.id, jobId)).rejects.toBe(failure)
    })
  })

  it('retries a transient terminal publish failure before returning the sync result', async () => {
    const user = await createTestUser()
    mockArticleListResponse(() => Promise.resolve({ Contents: [] }))
    const jobId = randomUUID()
    const publish = interceptOwnedPublish(jobId, attempt =>
      attempt === 1 ? Promise.reject(new Error('transient')) : null,
    )

    await withPublishedStatus(jobId, { status: 'completed', result: emptyResult() }, async () => {
      await expect(processArticleSync(user.id, jobId)).resolves.toEqual(emptyResult())
    })
    expect(publish()).toHaveLength(2)
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
  })

  it('reports a failed terminal publish after three attempts without undoing the sync', async () => {
    const user = await createTestUser()
    mockArticleListResponse(() => Promise.resolve({ Contents: [] }))
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

function mockArticleListResponse(answer: () => Promise<unknown>): () => number {
  const original = S3Client.prototype.send
  let calls = 0
  S3Client.prototype.send = vi.fn<VitestLooseMock>(function (this: S3Client, command: unknown) {
    if (command instanceof ListObjectsV2Command && command.input.Prefix === 'articles/') {
      calls++
      return answer()
    }
    return Reflect.apply(original, this, [command])
  }) as typeof original
  restoreMethods.push(() => {
    S3Client.prototype.send = original
  })
  return () => calls
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

async function withPublishedStatus(
  jobId: string,
  expected: ArticleSyncStatus,
  run: () => Promise<void>,
): Promise<void> {
  const subscription = await articleSyncPubSub.subscribe(jobId)
  const published = Promise.withResolvers<ArticleSyncStatus>()
  subscription.setHandler(value => published.resolve(value))
  try {
    await run()
    await expect(published.promise).resolves.toEqual(expected)
  } finally {
    await subscription.close()
  }
}
