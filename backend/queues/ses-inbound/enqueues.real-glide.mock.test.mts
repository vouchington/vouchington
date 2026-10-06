import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  getSesInboundProcessJobOptions,
  SES_INBOUND_PROCESS_JOB_NAME,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'
import { enqueueOrRetryBulkSesInboundProcess } from './enqueues.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('SES inbound reconciliation through real GlideMQ', () => {
  it('retries a retained failed process job for an object still in S3', async () => {
    const pipeWrapsBefore = countActivePipeWraps()
    const queueName = `ses_inbound_recovery_test_${randomUUID()}`
    const ownedConnectionOptions = {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    }
    // A graceful close waits out the worker's in-flight blocking read, so keep that read short.
    const workerOptions = { ...ownedConnectionOptions, blockTimeout: 1000 }
    const queue = new Queue<SesInboundProcessJobData>(queueName, ownedConnectionOptions)
    const failedSettled = Promise.withResolvers<void>()
    const failedWorker = new Worker<SesInboundProcessJobData>(
      queueName,
      async () => {
        throw new Error('transient failure')
      },
      workerOptions,
    )
    failedWorker.once('failed', () => failedSettled.resolve())
    const data = {
      sesMessageId: 'ses-recovery-test',
      objectKey: 'copyright-incoming/ses-recovery-test',
    }
    let recoveryWorker: Worker<SesInboundProcessJobData> | undefined

    try {
      const options = { ...getSesInboundProcessJobOptions(data), attempts: 1 }
      const job = await queue.add(SES_INBOUND_PROCESS_JOB_NAME, data, options)
      if (!job) throw new Error('Expected the failed test job to be created')
      await failedSettled.promise
      expect(await job.getState()).toBe('failed')
      await failedWorker.close()

      await expect(
        enqueueOrRetryBulkSesInboundProcess([data], {
          enqueueBulk: async inputs =>
            queue.addBulk(
              inputs.map(input => ({
                name: SES_INBOUND_PROCESS_JOB_NAME,
                data: input,
                opts: getSesInboundProcessJobOptions(input),
              })),
            ),
          getFailedJobs: async () => queue.getJobs('failed', 0, -1, { excludeData: true }),
        }),
      ).resolves.toBe(1)

      const recovered = Promise.withResolvers<void>()
      recoveryWorker = new Worker<SesInboundProcessJobData>(
        queueName,
        async () => undefined,
        workerOptions,
      )
      recoveryWorker.once('completed', () => recovered.resolve())
      await recovered.promise
      expect(await job.getState()).toBe('completed')
    } finally {
      await Promise.allSettled([failedWorker.close(), recoveryWorker?.close()])
      await queue.obliterate({ force: true })
      await queue.close()
    }

    expect(countActivePipeWraps()).toBeLessThanOrEqual(pipeWrapsBefore)
  })
})

function countActivePipeWraps(): number {
  return process.getActiveResourcesInfo().filter(resource => resource === 'PipeWrap').length
}
