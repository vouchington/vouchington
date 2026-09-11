import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import {
  enqueueBulkOAuthAuthorizationExchanges,
  enqueueOrReactivateBulkOAuthAuthorizationExchanges,
  enqueueOAuthAuthorizationExchange,
  enqueueOAuthAuthorizationExchangeDispatcher,
} from './enqueues.mts'
import { oauthAuthorizationExchangeQueue } from './queues.mts'

describe('OAuth authorization exchange enqueues', () => {
  it('enqueues only the durable authorization ID with stable job and deduplication IDs', async () => {
    const authorizationId = randomUUID()

    await enqueueOAuthAuthorizationExchange(authorizationId)

    const job = await oauthAuthorizationExchangeQueue.getJob(authorizationId)
    expect(job?.data).toEqual({ authorizationId })
    expect(job?.opts).toMatchObject({
      jobId: authorizationId,
      priority: 1,
      attempts: 5,
      backoff: { type: 'exponential', delay: 250 },
      removeOnComplete: 100,
      removeOnFail: 100,
      deduplication: { id: authorizationId, mode: 'simple' },
    })
  })

  it('throttles repeated dispatcher triggers under one logical ID', async () => {
    const deduplicationId = `oauth-exchange-dispatch-${randomUUID()}`

    await enqueueOAuthAuthorizationExchangeDispatcher({ deduplicationId })
    await enqueueOAuthAuthorizationExchangeDispatcher({ deduplicationId })

    const allJobs = await readAllQueueJobs(oauthAuthorizationExchangeQueue)
    const jobs = allJobs.filter(job => job.opts.jobId === deduplicationId)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.data).toEqual({})
    expect(jobs[0]?.opts).toMatchObject({
      priority: 100,
      ordering: { key: 'dispatcher', concurrency: 1 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      deduplication: {
        id: deduplicationId,
        mode: 'throttle',
        ttl: 60_000,
      },
    })
  })

  it('applies the same durable IDs and retry policy to bulk exchange jobs', async () => {
    const authorizationIds = [randomUUID(), randomUUID()]

    await enqueueBulkOAuthAuthorizationExchanges(
      authorizationIds.map(authorizationId => ({ authorizationId })),
    )

    for (const authorizationId of authorizationIds) {
      const job = await oauthAuthorizationExchangeQueue.getJob(authorizationId)
      expect(job?.data).toEqual({ authorizationId })
      expect(job?.opts).toMatchObject({
        jobId: authorizationId,
        attempts: 5,
        deduplication: { id: authorizationId, mode: 'simple' },
      })
    }
  })

  it('removes retained completed exchange jobs before bulk recovery enqueue', async () => {
    const authorizationId = randomUUID()
    const events: string[] = []
    const remove = vi.fn<() => Promise<void>>(async () => {
      events.push('remove')
    })

    await expect(
      enqueueOrReactivateBulkOAuthAuthorizationExchanges([{ authorizationId }], {
        getCompletedJobs: async () => [
          {
            id: authorizationId,
            name: 'exchangeOAuthAuthorization',
            remove,
          },
        ],
        enqueueBulk: async () => {
          events.push('enqueue')
          return []
        },
        getFailedJobs: async () => [],
      }),
    ).resolves.toBe(0)

    expect(remove).toHaveBeenCalledOnce()
    expect(events).toEqual(['remove', 'enqueue'])
  })

  it('retries only retained failed exchange jobs selected by durable recovery', async () => {
    const authorizationId = randomUUID()
    const retryCurrent = vi.fn<() => Promise<void>>(async () => undefined)
    const retryOther = vi.fn<() => Promise<void>>(async () => undefined)

    await expect(
      enqueueOrReactivateBulkOAuthAuthorizationExchanges([{ authorizationId }], {
        getCompletedJobs: async () => [],
        enqueueBulk: async () => [],
        getFailedJobs: async () => [
          {
            id: authorizationId,
            name: 'exchangeOAuthAuthorization',
            retry: retryCurrent,
          },
          {
            id: randomUUID(),
            name: 'exchangeOAuthAuthorization',
            retry: retryOther,
          },
        ],
      }),
    ).resolves.toBe(1)

    expect(retryCurrent).toHaveBeenCalledOnce()
    expect(retryOther).not.toHaveBeenCalled()
  })

  it('does not inspect queue state for an empty durable recovery page', async () => {
    const getCompletedJobs = vi.fn<() => Promise<never[]>>(async () => [])
    const enqueueBulk = vi.fn<typeof enqueueBulkOAuthAuthorizationExchanges>(async () => [])
    const getFailedJobs = vi.fn<() => Promise<never[]>>(async () => [])

    await expect(
      enqueueOrReactivateBulkOAuthAuthorizationExchanges([], {
        getCompletedJobs,
        enqueueBulk,
        getFailedJobs,
      }),
    ).resolves.toBe(0)
    expect(getCompletedJobs).not.toHaveBeenCalled()
    expect(enqueueBulk).not.toHaveBeenCalled()
    expect(getFailedJobs).not.toHaveBeenCalled()
  })

  it('preserves completed jobs with unrelated IDs or names', async () => {
    const remove = vi.fn<() => Promise<void>>(async () => undefined)
    const authorizationIds = [randomUUID(), randomUUID()]

    await enqueueOrReactivateBulkOAuthAuthorizationExchanges(
      authorizationIds.map(authorizationId => ({ authorizationId })),
      {
        getCompletedJobs: async () => [
          {
            id: authorizationIds[0]!,
            name: 'dispatchOAuthAuthorizationExchanges',
            remove,
          },
          {
            id: randomUUID(),
            name: 'exchangeOAuthAuthorization',
            remove,
          },
        ],
        enqueueBulk: async () => [],
        getFailedJobs: async () => [],
      },
    )

    expect(remove).not.toHaveBeenCalled()
  })

  it('aborts recovery enqueue when completed-job removal fails', async () => {
    const authorizationId = randomUUID()
    const enqueueBulk = vi.fn<typeof enqueueBulkOAuthAuthorizationExchanges>(async () => [])

    await expect(
      enqueueOrReactivateBulkOAuthAuthorizationExchanges([{ authorizationId }], {
        getCompletedJobs: async () => [
          {
            id: authorizationId,
            name: 'exchangeOAuthAuthorization',
            remove: async () => {
              throw new Error('remove failed')
            },
          },
        ],
        enqueueBulk,
        getFailedJobs: async () => [],
      }),
    ).rejects.toThrow('remove failed')
    expect(enqueueBulk).not.toHaveBeenCalled()
  })
})
