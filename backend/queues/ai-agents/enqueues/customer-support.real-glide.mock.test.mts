import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import type { CustomerSupportJobData } from '../types.mts'
import { enqueueOrRetryBulkCustomerSupport } from './customer-support.mts'

vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

describe('customer-support recovery through real GlideMQ', () => {
  it('retries a retained terminally failed keyed job', async () => {
    const queueName = `customer_support_recovery_test_${randomUUID()}`
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const queue = new Queue<CustomerSupportJobData>(queueName, connection)
    const failedWorker = new Worker<CustomerSupportJobData>(
      queueName,
      async () => {
        throw new Error('transient model failure')
      },
      connection,
    )
    const candidate = {
      threadId: randomUUID(),
      supportMessageId: randomUUID(),
      logicalJobId: `support_inbound_email__${randomUUID()}__customer_support`,
    }
    const data = {
      threadId: candidate.threadId,
      supportMessageId: candidate.supportMessageId,
      idempotencyKey: candidate.logicalJobId,
    } satisfies CustomerSupportJobData
    const options = {
      jobId: candidate.logicalJobId,
      attempts: 1,
      backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: 5,
      deduplication: { id: candidate.logicalJobId, mode: 'simple' as const },
    }
    const recoveryOptions = { ...options, attempts: 3 }
    let recoveryWorker: Worker<CustomerSupportJobData> | undefined

    try {
      const job = await queue.add('customer-support', data, options)
      if (!job) throw new Error('Expected the failed test job to be created')
      await vi.waitFor(async () => expect(await job.getState()).toBe('failed'), { timeout: 10_000 })
      await failedWorker.close()

      await expect(
        enqueueOrRetryBulkCustomerSupport([candidate], {
          enqueueBulk: async inputs =>
            await queue.addBulk(
              inputs.map(input => ({
                name: 'customer-support',
                data: {
                  threadId: input.threadId,
                  supportMessageId: input.supportMessageId,
                  idempotencyKey: input.logicalJobId,
                },
                opts: { ...recoveryOptions, jobId: input.logicalJobId },
              })),
            ),
          getJob: async id => await queue.getJob(id, { excludeData: true }),
          getFailedJobs: async () => await queue.getJobs('failed', 0, -1, { excludeData: true }),
        }),
      ).resolves.toBe(1)

      recoveryWorker = new Worker<CustomerSupportJobData>(
        queueName,
        async () => undefined,
        connection,
      )
      await vi.waitFor(async () => expect(await job.getState()).toBe('completed'), {
        timeout: 10_000,
      })
    } finally {
      await Promise.allSettled([failedWorker.close(), recoveryWorker?.close()])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('removes a retained completed orphan and re-adds the same stable ID', async () => {
    const queueName = `customer_support_completed_recovery_test_${randomUUID()}`
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const queue = new Queue<CustomerSupportJobData>(queueName, connection)
    let executions = 0
    const firstWorker = new Worker<CustomerSupportJobData>(
      queueName,
      async () => {
        executions += 1
      },
      connection,
    )
    const candidate = {
      threadId: randomUUID(),
      supportMessageId: randomUUID(),
      logicalJobId: `support_inbound_email__${randomUUID()}__customer_support`,
    }
    const data = {
      threadId: candidate.threadId,
      supportMessageId: candidate.supportMessageId,
      idempotencyKey: candidate.logicalJobId,
    } satisfies CustomerSupportJobData
    const options = {
      jobId: candidate.logicalJobId,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: 5,
      deduplication: { id: candidate.logicalJobId, mode: 'simple' as const },
    }
    let recoveryWorker: Worker<CustomerSupportJobData> | undefined

    try {
      const firstJob = await queue.add('customer-support', data, options)
      if (!firstJob) throw new Error('Expected the completed orphan test job to be created')
      await vi.waitFor(async () => expect(await firstJob.getState()).toBe('completed'), {
        timeout: 10_000,
      })
      const unrelatedJob = await queue.add(
        'customer-support',
        { ...data, idempotencyKey: `${candidate.logicalJobId}-unrelated` },
        { ...options, jobId: `${candidate.logicalJobId}-unrelated` },
      )
      if (!unrelatedJob) throw new Error('Expected the unrelated completed job to be created')
      await vi.waitFor(async () => expect(await unrelatedJob.getState()).toBe('completed'), {
        timeout: 10_000,
      })
      await firstWorker.close()

      await enqueueOrRetryBulkCustomerSupport([candidate], {
        getJob: async id => await queue.getJob(id, { excludeData: true }),
        enqueueBulk: async inputs =>
          await queue.addBulk(
            inputs.map(input => ({
              name: 'customer-support',
              data: {
                threadId: input.threadId,
                supportMessageId: input.supportMessageId,
                idempotencyKey: input.logicalJobId,
              },
              opts: { ...options, jobId: input.logicalJobId },
            })),
          ),
        getFailedJobs: async () => await queue.getJobs('failed', 0, -1, { excludeData: true }),
      })

      recoveryWorker = new Worker<CustomerSupportJobData>(
        queueName,
        async () => {
          executions += 1
        },
        connection,
      )
      await vi.waitFor(() => expect(executions).toBe(3), { timeout: 10_000 })
      await expect(queue.getJob(candidate.logicalJobId)).resolves.toMatchObject({
        id: candidate.logicalJobId,
      })
      await expect(unrelatedJob.getState()).resolves.toBe('completed')
    } finally {
      await Promise.allSettled([firstWorker.close(), recoveryWorker?.close()])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
