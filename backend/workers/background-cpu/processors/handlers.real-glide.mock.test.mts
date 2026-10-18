import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Queue, QueueEvents } from 'glide-mq'
import {
  closeAndUnregisterGlideMQInstance,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { BACKGROUND_CPU_QUEUE_NAME, type BackgroundCpuDomain } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import {
  getQueueDomainControl,
  pauseQueueDomain,
  resumeQueueDomain,
  watchQueueDomainControls,
} from '@services/queue-domain-controls'
import {
  createTestUserDirect,
  deleteTestPost,
  getLanguageDetectionStateForTest,
  insertTestPost,
} from '@voucha/test-helpers'
import { createBackgroundCpuWorker } from '../workers/create-worker.mts'
import { BACKGROUND_CPU_HANDLERS } from './handlers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('background-cpu production routing through real GlideMQ', () => {
  let queue: Queue | undefined
  let worker: ReturnType<typeof createBackgroundCpuWorker> | undefined
  let events: QueueEvents | undefined

  afterEach(async () => {
    if (worker) await closeAndUnregisterGlideMQInstance(worker)
    await events?.close()
    if (queue) {
      await queue.obliterate({ force: true })
      await queue.close()
    }
    worker = undefined
    queue = undefined
    events = undefined
  })

  async function startWorker(domains: readonly BackgroundCpuDomain[] = ['content-analysis']) {
    const prefix = `${workerQueuePrefix}-background-cpu-routing-${randomUUID()}`
    queue = new Queue(BACKGROUND_CPU_QUEUE_NAME, { connection: workerQueueConnection, prefix })
    events = new QueueEvents(BACKGROUND_CPU_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
      lastEventId: '0',
      blockTimeout: 1_000,
    })
    worker = createBackgroundCpuWorker({
      handlers: BACKGROUND_CPU_HANDLERS,
      domains,
      prefix,
      concurrency: 1,
    })
    worker.on('error', () => undefined)
    await Promise.all([worker.waitUntilReady(), events.waitUntilReady()])
    return { queue, events, worker }
  }

  it('runs a registered language detection handler and persists its result', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Language detection ${suffix}`,
      slug: `cpu-language-${suffix}`,
      markdown: 'This is an English language article with enough words for detection.',
      createdById: user.id,
    })
    const { queue, worker } = await startWorker()
    const settled = Promise.withResolvers<'completed' | 'failed'>()
    worker.on('completed', () => settled.resolve('completed'))
    worker.on('failed', () => settled.resolve('failed'))

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

  it('fails an unknown job without retrying it', async () => {
    const { queue, events } = await startWorker()
    const failed = once(events, 'failed')
    const job = await queue.add('content-analysis.unknown', {}, { attempts: 3, priority: 10 })
    if (!job) throw new Error('Expected unknown CPU job')

    const [event] = await failed
    expect(event).toMatchObject({ jobId: job.id })
    const stored = await queue.getJob(job.id)
    expect(await stored?.getState()).toBe('failed')
    expect(stored?.attemptsMade).toBeLessThan(3)
  })

  it('rejects a malformed Bedrock reconciliation before reading entities', async () => {
    const { queue, events } = await startWorker(['bedrock-embeddings'])
    const failed = once(events, 'failed')
    const definition = requireBackgroundCpuJob('bedrock-embeddings.reconcile_existing')
    const job = await queue.add(definition.name, { entityType: 'unknown' }, definition.options)
    if (!job) throw new Error('Expected reconciliation job')

    const [event] = await failed
    expect(event).toMatchObject({ jobId: job.id })
    const stored = await queue.getJob(job.id)
    expect(await stored?.getState()).toBe('failed')
  })

  it('rejects a staydown hash job without its image id', async () => {
    const { queue, events } = await startWorker()
    const failed = once(events, 'failed')
    const definition = requireBackgroundCpuJob('content-analysis.staydown-hash')
    const job = await queue.add(definition.name, {}, { ...definition.options, attempts: 1 })
    if (!job) throw new Error('Expected staydown hash job')

    const [event] = await failed
    expect(event).toMatchObject({ jobId: job.id })
    const stored = await queue.getJob(job.id)
    expect(await stored?.getState()).toBe('failed')
  })

  it('parks a registered job outside its selected domain without spending an attempt', async () => {
    const { queue, events } = await startWorker()
    const delayed = once(events, 'delay-changed')
    const definition = requireBackgroundCpuJob('bedrock-embeddings.post')
    const job = await queue.add(definition.name, { id: randomUUID() }, definition.options)
    if (!job) throw new Error('Expected Bedrock CPU job')

    const [event] = await delayed
    expect(event).toMatchObject({ jobId: job.id })
    const stored = await queue.getJob(job.id)
    expect(await stored?.getState()).toBe('delayed')
    expect(stored?.attemptsMade).toBe(0)
  })

  it('defers a paused domain job without invoking its handler or spending an attempt', async () => {
    const domain = 'content-analysis'
    expect((await getQueueDomainControl(domain)).paused).toBe(false)
    const user = await createTestUserDirect()
    const pauseInvalidated = Promise.withResolvers<void>()
    const resumeInvalidated = Promise.withResolvers<void>()
    let changes = 0
    const watcher = await watchQueueDomainControls(changed => {
      if (changed !== domain) return
      changes += 1
      if (changes === 1) pauseInvalidated.resolve()
      if (changes === 2) resumeInvalidated.resolve()
    })
    let paused = false
    try {
      const { queue, events } = await startWorker()
      const delayed = once(events, 'delay-changed')
      await pauseQueueDomain(domain, { userId: user.id })
      paused = true
      await pauseInvalidated.promise

      const definition = requireBackgroundCpuJob('content-analysis.post')
      const job = await queue.add(definition.name, { id: randomUUID() }, definition.options)
      if (!job) throw new Error('Expected paused content-analysis job')

      const [event] = await delayed
      expect(event).toMatchObject({ jobId: job.id })
      const stored = await queue.getJob(job.id)
      expect(await stored?.getState()).toBe('delayed')
      expect(stored?.attemptsMade).toBe(0)
    } finally {
      try {
        if (paused) {
          await resumeQueueDomain(domain)
          await resumeInvalidated.promise
        }
      } finally {
        await watcher.close()
      }
    }
  })
})
