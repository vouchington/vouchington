import { randomUUID } from 'node:crypto'
import { Queue, type Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection } from '@data-stores/valkey-glide-mq'
import { MODERATION_OMNI_SINGLE_QUEUE_NAME } from '@queues/openai-moderation/config'
import { createOpenAIModerationOmniSingleWorker } from '../processors/create-omni-single-worker.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('OpenAI moderation omni worker entrypoint', () => {
  it('rejects a job that does not include an image id', async () => {
    const prefix = `test-openai-moderation-${randomUUID()}`
    const queue = new Queue(MODERATION_OMNI_SINGLE_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
    })
    let worker: Worker | undefined
    try {
      worker = createOpenAIModerationOmniSingleWorker({ prefix })
      await worker.waitUntilReady()
      const job = await queue.add('image', {}, { attempts: 1, removeOnFail: false })
      if (!job) throw new Error('Expected malformed image moderation job')

      await vi.waitFor(async () => expect(await job.getState()).toBe('failed'), {
        timeout: 10_000,
      })
      const failedJob = await queue.getJob(job.id)
      expect(failedJob?.failedReason).toBe('Image job requires id in job.data')
    } finally {
      try {
        await worker?.close()
      } finally {
        try {
          await queue.obliterate({ force: true })
        } finally {
          await queue.close()
        }
      }
    }
  })
})
