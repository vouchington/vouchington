import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Queue, Worker } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import {
  createTestUserDirect,
  deleteTestPost,
  getLanguageDetectionStateForTest,
  insertTestPost,
} from '@voucha/test-helpers'
import { createBackgroundCpuProcessor } from '../processors.mts'
import { buildCpuHandlerMap } from './handler-map.mts'
import { BACKGROUND_CPU_HANDLERS } from './handlers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('background-cpu production routing through real GlideMQ', () => {
  let queue: Queue | undefined
  let worker: Worker | undefined

  afterEach(async () => {
    await worker?.close(true)
    if (queue) {
      await queue.obliterate({ force: true })
      await queue.close()
    }
    worker = undefined
    queue = undefined
  })

  it('runs a registered language detection handler and persists its result', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Language detection ${suffix}`,
      slug: `cpu-language-${suffix}`,
      markdown: 'This is an English language article with enough words for detection.',
      createdById: user.id,
    })
    const queueName = `background_cpu_route_${randomUUID()}`
    queue = new Queue(queueName, connection)
    const settled = Promise.withResolvers<'completed' | 'failed'>()
    worker = new Worker(
      queueName,
      createBackgroundCpuProcessor(buildCpuHandlerMap(BACKGROUND_CPU_HANDLERS)),
      {
        ...connection,
        blockTimeout: 1_000,
      },
    )
    worker.on('error', () => undefined)
    worker.on('completed', () => settled.resolve('completed'))
    worker.on('failed', () => settled.resolve('failed'))
    await worker.waitUntilReady()

    const definition = requireBackgroundCpuJob('content-analysis.post')
    try {
      const job = await queue.add(definition.name, { id: postId }, definition.options)
      expect(job).toBeTruthy()
      await expect(settled.promise).resolves.toBe('completed')
      await expect(getLanguageDetectionStateForTest('posts', postId)).resolves.toMatchObject({
        lingua_rs_input_sha256: expect.any(Buffer),
        lingua_rs_detected_at: expect.any(Date),
      })
    } finally {
      await deleteTestPost(postId)
    }
  })
})
