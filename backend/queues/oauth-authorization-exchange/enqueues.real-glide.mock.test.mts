import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import type { OAuthAuthorizationExchangeJobData } from './types.mts'
import { enqueueOrReactivateBulkOAuthAuthorizationExchanges } from './enqueues.mts'

vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

describe('OAuth authorization exchange recovery through real GlideMQ', () => {
  it('reactivates matching completed and failed stable IDs without touching unrelated jobs', async () => {
    const queueName = `oauth_authorization_exchange_recovery_${randomUUID()}`
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const queue = new Queue<OAuthAuthorizationExchangeJobData>(queueName, connection)
    const completedAuthorizationId = randomUUID()
    const failedAuthorizationId = randomUUID()
    const unrelatedAuthorizationId = randomUUID()
    const executionCounts = new Map<string, number>()
    let failSelectedJob = true
    const initialWorker = new Worker<OAuthAuthorizationExchangeJobData>(
      queueName,
      async (job: Job<OAuthAuthorizationExchangeJobData>) => {
        const authorizationId = String(job.data.authorizationId)
        executionCounts.set(authorizationId, (executionCounts.get(authorizationId) ?? 0) + 1)
        if (authorizationId === failedAuthorizationId && failSelectedJob) {
          throw new Error('expected terminal exchange failure')
        }
      },
      connection,
    )
    initialWorker.on('error', () => undefined)
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
      await vi.waitFor(async () => expect(await completedJob.getState()).toBe('completed'), {
        timeout: 10_000,
      })
      await vi.waitFor(async () => expect(await failedJob.getState()).toBe('failed'), {
        timeout: 10_000,
      })
      await vi.waitFor(async () => expect(await unrelatedJob.getState()).toBe('completed'), {
        timeout: 10_000,
      })
      await initialWorker.close()
      failSelectedJob = false

      const inputs = [
        { authorizationId: completedAuthorizationId },
        { authorizationId: failedAuthorizationId },
      ]
      await expect(
        enqueueOrReactivateBulkOAuthAuthorizationExchanges(inputs, {
          getCompletedJobs: async () =>
            await queue.getJobs('completed', 0, -1, { excludeData: true }),
          enqueueBulk: async jobs =>
            await queue.addBulk(
              jobs.map(data => ({
                name: 'exchangeOAuthAuthorization',
                data,
                opts: options(data.authorizationId),
              })),
            ),
          getFailedJobs: async () => await queue.getJobs('failed', 0, -1, { excludeData: true }),
        }),
      ).resolves.toBe(1)

      recoveryWorker = new Worker<OAuthAuthorizationExchangeJobData>(
        queueName,
        async (job: Job<OAuthAuthorizationExchangeJobData>) => {
          const authorizationId = String(job.data.authorizationId)
          executionCounts.set(authorizationId, (executionCounts.get(authorizationId) ?? 0) + 1)
        },
        connection,
      )
      await vi.waitFor(
        () => {
          expect(executionCounts.get(completedAuthorizationId)).toBe(2)
          expect(executionCounts.get(failedAuthorizationId)).toBe(2)
        },
        { timeout: 10_000 },
      )
      await expect(unrelatedJob.getState()).resolves.toBe('completed')
      expect(executionCounts.get(unrelatedAuthorizationId)).toBe(1)
    } finally {
      await Promise.allSettled([initialWorker.close(), recoveryWorker?.close()])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
