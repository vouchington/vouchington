import { Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq/glide-mq-shared-client'
import { background } from '@queues/background/queues'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import {
  getSesInboundProcessJobOptions,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'
import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import { enqueueOrRetryBulkSesInboundProcess } from './enqueues.mts'

// A random Valkey database gives this file a private `voucha_qdb_<n>` queue namespace.
vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('SES inbound reconciliation through real GlideMQ', () => {
  it('retries a retained failed process job for an object still in S3', async () => {
    // The shared command client opens its pipe on its first command and keeps it for the life of
    // the process, so a baseline taken before that command is an off-by-one that fails when the
    // queue's first add opens it.
    await workerQueueCommandClient.ping()
    const pipeWrapsBefore = countActivePipeWraps()
    // A graceful close waits out the worker's in-flight blocking read, so keep that read short.
    const workerOptions = {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
      blockTimeout: 1000,
    }
    const failedSettled = Promise.withResolvers<void>()
    const failedWorker = new Worker<SesInboundProcessJobData>(
      background.name,
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
      const options = {
        ...SES_INBOUND_PROCESS_JOB.options,
        ...getSesInboundProcessJobOptions(data),
        attempts: 1,
      }
      const job = await background.add(SES_INBOUND_PROCESS_JOB.name, data, options)
      if (!job) throw new Error('Expected the failed test job to be created')
      await waitForRealGlideEvent(failedSettled.promise, 'GlideMQ SES inbound failure')
      expect(await job.getState()).toBe('failed')
      await failedWorker.close()

      await expect(enqueueOrRetryBulkSesInboundProcess([data])).resolves.toBe(1)

      const recovered = Promise.withResolvers<void>()
      recoveryWorker = new Worker<SesInboundProcessJobData>(
        background.name,
        async () => undefined,
        workerOptions,
      )
      recoveryWorker.once('completed', () => recovered.resolve())
      await waitForRealGlideEvent(recovered.promise, 'GlideMQ SES inbound recovery')
      expect(await job.getState()).toBe('completed')
    } finally {
      await Promise.allSettled([failedWorker.close(), recoveryWorker?.close()])
      await background.obliterate({ force: true })
      await closeAndUnregisterGlideMQInstance(background)
    }

    expect(countActivePipeWraps()).toBeLessThanOrEqual(pipeWrapsBefore)
  })
})

function countActivePipeWraps(): number {
  return process.getActiveResourcesInfo().filter(resource => resource === 'PipeWrap').length
}
