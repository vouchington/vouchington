import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { getPrivateUserByAny } from '@services/users/get'
import type { ArticleSyncResult, syncArticles } from '@services/articles'
import { articleSyncPubSub, type ArticleSyncStatus } from '@data-stores/valkey-pubsub'
import { UnrecoverableError } from '@modules/queue-errors'
import { processArticleSync, publishTerminalStatus } from './processors.mts'

const mockGetPrivateUserByAny = vi.fn<typeof getPrivateUserByAny>()
const mockSyncArticles = vi.fn<typeof syncArticles>()

describe('article-sync processors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves user and returns the sync result', async () => {
    const fakeUser = { id: randomUUID() }
    const result = makeSyncResult(3)
    mockGetPrivateUserByAny.mockResolvedValue(fakeUser as never)
    mockSyncArticles.mockResolvedValue(result)

    await expect(runProcessArticleSync(fakeUser.id)).resolves.toEqual(result)
    expect(mockGetPrivateUserByAny).toHaveBeenCalledWith(fakeUser.id)
    expect(mockSyncArticles).toHaveBeenCalledWith(fakeUser)
  })

  it('throws UnrecoverableError when the user does not exist', async () => {
    const missingUserId = randomUUID()

    await expect(processArticleSync(missingUserId)).rejects.toThrow(UnrecoverableError)
    await expect(processArticleSync(missingUserId)).rejects.toThrow(
      `User ${missingUserId} not found`,
    )
  })

  it('publishes completed status on the real pub/sub channel when jobId is provided', async () => {
    const fakeUser = { id: randomUUID() }
    const result = makeSyncResult(5)
    mockGetPrivateUserByAny.mockResolvedValue(fakeUser as never)
    mockSyncArticles.mockResolvedValue(result)
    const jobId = randomUUID()
    const status: ArticleSyncStatus = { status: 'completed', result }

    const received = await withPublishedStatus(jobId, status, async () => {
      await runProcessArticleSync(fakeUser.id, jobId)
    })
    expect(received).toEqual([status])
  })

  it('publishes failed status on the real pub/sub channel and re-throws', async () => {
    const fakeUser = { id: randomUUID() }
    mockGetPrivateUserByAny.mockResolvedValue(fakeUser as never)
    mockSyncArticles.mockRejectedValue(new Error('network error'))
    const jobId = randomUUID()

    await withPublishedStatus(jobId, { status: 'failed', error: 'network error' }, async () => {
      await expect(runProcessArticleSync(fakeUser.id, jobId)).rejects.toThrow('network error')
    })
  })

  it('uses the default pub/sub publisher when no publisher is injected', async () => {
    const jobId = randomUUID()
    const status: ArticleSyncStatus = { status: 'completed', result: makeSyncResult(1) }

    const received = await withPublishedStatus(jobId, status, async () => {
      await publishTerminalStatus(jobId, status)
    })
    expect(received).toEqual([status])
  })

  it('reports terminal publish failure after all retry attempts fail', async () => {
    const mockSleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
    const mockOnError = vi.fn<(error: Error) => void>()
    const mockPublish = vi
      .fn<(jobId: string, status: ArticleSyncStatus) => Promise<void>>()
      .mockRejectedValue('still down' as never)

    await publishTerminalStatus(
      'job-fail',
      { status: 'failed', error: 'boom' },
      {
        onError: mockOnError,
        publish: mockPublish,
        sleep: mockSleep,
      },
    )

    expect(mockPublish).toHaveBeenCalledTimes(3)
    expect(mockSleep).toHaveBeenCalledTimes(2)
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('retries transient terminal publish failures before resolving', async () => {
    const mockSleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
    const mockOnError = vi.fn<(error: Error) => void>()
    const mockPublish = vi.fn<(jobId: string, status: ArticleSyncStatus) => Promise<void>>()
    mockPublish.mockRejectedValueOnce(new Error('transient')).mockResolvedValue(undefined)

    await publishTerminalStatus(
      'job-retry',
      { status: 'completed', result: makeSyncResult(2) },
      {
        onError: mockOnError,
        publish: mockPublish,
        sleep: mockSleep,
      },
    )

    expect(mockSleep).toHaveBeenCalledWith(100)
    expect(mockPublish).toHaveBeenCalledTimes(2)
    expect(mockOnError).not.toHaveBeenCalled()
  })
})

function makeSyncResult(created: number): ArticleSyncResult {
  return {
    results: [],
    summary: { created, updated: 0, skipped: 0, errored: 0 },
  }
}

function runProcessArticleSync(
  userId: string,
  jobId?: string,
): ReturnType<typeof processArticleSync> {
  return processArticleSync(userId, jobId, {
    getPrivateUserByAny: mockGetPrivateUserByAny,
    syncArticles: mockSyncArticles,
  })
}

async function withPublishedStatus(
  jobId: string,
  expected: ArticleSyncStatus,
  run: () => Promise<void>,
): Promise<ArticleSyncStatus[]> {
  const subscription = await articleSyncPubSub.subscribe(jobId)
  const received: ArticleSyncStatus[] = []
  subscription.setHandler(value => received.push(value))
  try {
    await run()
    await vi.waitFor(
      () => {
        expect(received).toEqual([expected])
      },
      { timeout: 10_000, interval: 50 },
    )
    return received
  } finally {
    await subscription.close()
  }
}
