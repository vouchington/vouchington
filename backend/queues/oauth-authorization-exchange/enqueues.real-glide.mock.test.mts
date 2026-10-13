import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  ENQUEUE_BASE_DEFAULTS,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { startRealGlideJobLifecycle } from '@voucha/test-helpers/real-glide-job-lifecycle'
import type { OAuthAuthorizationExchangeJobData } from './types.mts'
import {
  enqueueOrReactivateBulkOAuthAuthorizationExchanges,
  getOAuthAuthorizationExchangeDispatcherJobOptions,
} from './enqueues.mts'
import { oauthAuthorizationExchangeQueue } from './queues.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('OAuth authorization exchange recovery through real GlideMQ', () => {
  it('reactivates matching completed and failed stable IDs without touching unrelated jobs', async () => {
    const queueName = `oauth_authorization_exchange_recovery_${randomUUID()}`
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    // A graceful close waits out the worker's in-flight blocking read, so keep that read short.
    const workerOptions = { ...connection, blockTimeout: 1000 }
    const queue = new Queue<OAuthAuthorizationExchangeJobData>(queueName, connection)
    const completedAuthorizationId = randomUUID()
    const failedAuthorizationId = randomUUID()
    const unrelatedAuthorizationId = randomUUID()
    const executionCounts = new Map<string, number>()
    let failSelectedJob = true
    const initialWorker = new Worker<OAuthAuthorizationExchangeJobData>(
      queueName,
      async (job: Job<OAuthAuthorizationExchangeJobData>) => {
        const authorizationId = job.data.authorizationId
        executionCounts.set(authorizationId, (executionCounts.get(authorizationId) ?? 0) + 1)
        if (authorizationId === failedAuthorizationId && failSelectedJob) {
          throw new Error('expected terminal exchange failure')
        }
      },
      workerOptions,
    )
    initialWorker.on('error', () => undefined)
    const terminalStates = new Map<string, 'completed' | 'failed'>()
    const initialSettled = Promise.withResolvers<void>()
    const trackedIds = new Set<string>([
      completedAuthorizationId,
      failedAuthorizationId,
      unrelatedAuthorizationId,
    ])
    const noteTerminal = (
      settledJob: Job<OAuthAuthorizationExchangeJobData> | undefined,
      state: 'completed' | 'failed',
    ) => {
      if (!settledJob || !trackedIds.has(settledJob.id)) return
      terminalStates.set(settledJob.id, state)
      if (terminalStates.size === trackedIds.size) initialSettled.resolve()
    }
    initialWorker.on('completed', settledJob => noteTerminal(settledJob, 'completed'))
    initialWorker.on('failed', settledJob => noteTerminal(settledJob, 'failed'))
    const options = (authorizationId: string) => ({
      jobId: authorizationId,
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: 1,
      deduplication: { id: authorizationId, mode: 'simple' as const },
    })
    let recoveryWorker: Worker<OAuthAuthorizationExchangeJobData> | undefined

    try {
      const completedJob = await queue.add(
        'exchangeOAuthAuthorization',
        { authorizationId: completedAuthorizationId },
        options(completedAuthorizationId),
      )
      const failedJob = await queue.add(
        'exchangeOAuthAuthorization',
        { authorizationId: failedAuthorizationId },
        options(failedAuthorizationId),
      )
      const unrelatedJob = await queue.add(
        'exchangeOAuthAuthorization',
        { authorizationId: unrelatedAuthorizationId },
        options(unrelatedAuthorizationId),
      )
      if (!completedJob || !failedJob || !unrelatedJob) {
        throw new Error('Expected terminal exchange test jobs to be created')
      }
      await initialSettled.promise
      await expect(completedJob.getState()).resolves.toBe('completed')
      await expect(failedJob.getState()).resolves.toBe('failed')
      await expect(unrelatedJob.getState()).resolves.toBe('completed')
      await initialWorker.close()
      failSelectedJob = false

      const lookups: string[] = []
      const terminalJobs = async (ids: readonly string[], state: string) => {
        const jobs = await Promise.all(
          ids.map(async id => {
            lookups.push(id)
            const job = await queue.getJob(id)
            return job && (await job.getState()) === state ? job : null
          }),
        )
        return jobs.filter(job => job !== null)
      }
      const inputs = [
        { authorizationId: completedAuthorizationId },
        { authorizationId: failedAuthorizationId },
      ]
      await expect(
        enqueueOrReactivateBulkOAuthAuthorizationExchanges(inputs, {
          getCompletedJobs: ids => terminalJobs(ids, 'completed'),
          enqueueBulk: async jobs =>
            queue.addBulk(
              jobs.map(data => ({
                name: 'exchangeOAuthAuthorization',
                data,
                opts: options(data.authorizationId),
              })),
            ),
          getFailedJobs: ids => terminalJobs(ids, 'failed'),
        }),
      ).resolves.toBe(1)

      expect(new Set(lookups)).toEqual(new Set(inputs.map(input => input.authorizationId)))
      expect(lookups).not.toContain(unrelatedAuthorizationId)

      const recovered = Promise.withResolvers<void>()
      const recoveredIds = new Set<string>()
      recoveryWorker = new Worker<OAuthAuthorizationExchangeJobData>(
        queueName,
        async (job: Job<OAuthAuthorizationExchangeJobData>) => {
          const authorizationId = job.data.authorizationId
          executionCounts.set(authorizationId, (executionCounts.get(authorizationId) ?? 0) + 1)
        },
        workerOptions,
      )
      recoveryWorker.on('completed', job => {
        if (job.id !== completedAuthorizationId && job.id !== failedAuthorizationId) return
        recoveredIds.add(job.id)
        if (recoveredIds.size === 2) recovered.resolve()
      })
      await recovered.promise
      expect(executionCounts.get(completedAuthorizationId)).toBe(2)
      expect(executionCounts.get(failedAuthorizationId)).toBe(2)
      await expect(unrelatedJob.getState()).resolves.toBe('completed')
      expect(executionCounts.get(unrelatedAuthorizationId)).toBe(1)
    } finally {
      await Promise.allSettled([initialWorker.close(), recoveryWorker?.close()])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

// The admin backfill and manual triggers reuse one logical dispatcher id, so a later trigger must
// start a new pass once the previous one is done however it ended.
describe('OAuth exchange dispatcher enqueue through real GlideMQ', () => {
  afterAll(() => oauthAuthorizationExchangeQueue.close())

  // The throttle window is wall-clock time: dropping its ttl lets the replay isolate the job-id
  // claim, which is the part that used to outlive the job. Zero priority skips the scheduler's ~5s
  // promotion of prioritized jobs, and one attempt avoids waiting out a retry backoff.
  const productionOptions = (deduplicationId: string) => {
    const { deduplication, ...options } =
      getOAuthAuthorizationExchangeDispatcherJobOptions(deduplicationId)
    return {
      ...ENQUEUE_BASE_DEFAULTS,
      ...options,
      deduplication: { id: deduplication.id, mode: deduplication.mode },
      attempts: 1,
      priority: 0,
    }
  }

  it.each(['complete', 'fail'] as const)(
    'accepts a repeat trigger after the previous pass %s with its record retained',
    async outcome => {
      const lifecycle = await startRealGlideJobLifecycle<Record<string, never>>(
        'oauth_dispatcher',
        { connection: workerQueueConnection, prefix: workerQueuePrefix },
      )
      const options = productionOptions('backfill:oauth-authorization-exchange-dispatch')
      try {
        lifecycle.setOutcome(outcome)
        const first = await lifecycle.queue.add('dispatchOAuthAuthorizationExchanges', {}, options)
        if (!first) throw new Error('Expected the first dispatcher pass to be created')
        await expect(lifecycle.settled(first)).resolves.toBe(
          outcome === 'complete' ? 'completed' : 'failed',
        )
        await expect(lifecycle.queue.getJob(first.id)).resolves.not.toBeNull()

        lifecycle.setOutcome('complete')
        const second = await lifecycle.queue.add('dispatchOAuthAuthorizationExchanges', {}, options)
        expect(second).not.toBeNull()
        expect(second?.id).not.toBe(first.id)
        await expect(lifecycle.settled(second!)).resolves.toBe('completed')
      } finally {
        await lifecycle.close()
      }
    },
  )
})
