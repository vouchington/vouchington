import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB } from '@queues/background/enqueues/oauth-authorization-exchange-jobs'
import {
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
    expect(job?.name).toBe('oauth-authorization-exchange.exchangeOAuthAuthorization')
    expect(job?.opts).toMatchObject({
      jobId: authorizationId,
      priority: 10,
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
    const jobs = allJobs.filter(
      job =>
        job.name === OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB.name &&
        job.opts.deduplication?.id === deduplicationId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.data).toEqual({})
    // A stable jobId would outlive the job and silently refuse every later trigger.
    expect(jobs[0]?.opts.jobId).toBeUndefined()
    expect(jobs[0]?.opts).toMatchObject({
      priority: 100,
      ordering: { key: 'oauth-authorization-exchange:dispatcher', concurrency: 1 },
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

    await expect(
      enqueueOrReactivateBulkOAuthAuthorizationExchanges(
        authorizationIds.map(authorizationId => ({ authorizationId })),
      ),
    ).resolves.toBe(0)

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
})
