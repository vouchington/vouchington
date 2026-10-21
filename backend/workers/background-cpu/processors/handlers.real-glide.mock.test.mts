import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Queue, QueueEvents } from 'glide-mq'
import {
  closeAndUnregisterGlideMQInstance,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import {
  BACKGROUND_CPU_QUEUE_NAME,
  backgroundCpuQueueConfig,
  type BackgroundCpuDomain,
} from '@queues/background-cpu/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
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
import {
  acquireContentAnalysisTestReservation,
  closeQueueDomainTestWatcher,
  waitForQueueDomainTestResult,
} from '@voucha/test-helpers/queue-domain-controls'
import { createBackgroundCpuWorker } from '../workers/create-worker.mts'
import { BACKGROUND_CPU_HANDLERS } from './handlers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('background-cpu production routing through real GlideMQ', () => {
  let queue: Queue | undefined
  let worker: ReturnType<typeof createBackgroundCpuWorker> | undefined
  let events: QueueEvents | undefined
  let reservation: ReturnType<typeof acquireContentAnalysisTestReservation> | undefined
  let pauseCleanup: (() => Promise<void>) | undefined
  let cleanup: () => Promise<void>
  let mutations: Promise<unknown>[]

  beforeEach(context => {
    reservation = undefined
    pauseCleanup = undefined
    mutations = []
    let closing: Promise<void> | undefined
    cleanup = () =>
      (closing ??= (async () => {
        await using closingResources = new AsyncDisposableStack()
        closingResources.defer(async () => {
          try {
            const lease = await reservation
            await lease?.release()
          } finally {
            worker = undefined
            queue = undefined
            events = undefined
          }
        })
        closingResources.defer(async () => {
          await queue?.close()
        })
        closingResources.defer(async () => {
          await queue?.obliterate({ force: true })
        })
        closingResources.defer(async () => {
          await events?.close()
        })
        closingResources.defer(async () => {
          if (worker) await closeAndUnregisterGlideMQInstance(worker)
        })
        await Promise.allSettled(mutations)
        await pauseCleanup?.()
      })())
    context.onTestFinished(cleanup)
  })
  afterEach(() => cleanup())

  function trackMutation<T>(signal: AbortSignal, start: () => Promise<T>): Promise<T> {
    signal.throwIfAborted()
    const operation = start()
    mutations.push(operation)
    return operation
  }

  async function startWorker(
    signal: AbortSignal,
    domains: readonly BackgroundCpuDomain[] = ['content-analysis'],
  ) {
    signal.throwIfAborted()
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
      blockTimeout: 1_000,
    })
    worker.on('error', () => undefined)
    await Promise.all([worker.waitUntilReady(), events.waitUntilReady()])
    signal.throwIfAborted()
    return { queue, events, worker }
  }

  describe('while content analysis is running', () => {
    beforeEach(async ({ signal }) => {
      reservation = acquireContentAnalysisTestReservation('shared')
      await reservation
      signal.throwIfAborted()
    })

    it('runs a registered language detection handler and persists its result', async ({
      signal,
    }) => {
      const user = await trackMutation(signal, () => createTestUserDirect())
      const suffix = randomUUID()
      const postId = await trackMutation(signal, () =>
        insertTestPost({
          title: `Language detection ${suffix}`,
          slug: `cpu-language-${suffix}`,
          markdown: 'This is an English language article with enough words for detection.',
          createdById: user.id,
        }),
      )
      const { queue, worker } = await startWorker(signal)
      const settled = Promise.withResolvers<'completed' | 'failed'>()
      const outcome = waitForQueueDomainTestResult(settled.promise, signal)
      worker.on('completed', () => settled.resolve('completed'))
      worker.on('failed', () => settled.resolve('failed'))

      const definition = requireBackgroundCpuJob('content-analysis.post')
      try {
        const job = await trackMutation(signal, () =>
          queue.add(definition.name, { id: postId }, definition.options),
        )
        expect(job).toBeTruthy()
        await expect(outcome).resolves.toBe('completed')
        await expect(getLanguageDetectionStateForTest('posts', postId)).resolves.toMatchObject({
          lingua_rs_input_sha256: expect.any(Buffer),
          lingua_rs_detected_at: expect.any(Date),
        })
      } finally {
        await deleteTestPost(postId)
      }
    })

    it('rejects a staydown hash job without its image id', async ({ signal }) => {
      const { queue, events } = await startWorker(signal)
      const failed = waitForQueueDomainTestResult(once(events, 'failed', { signal }), signal)
      const definition = requireBackgroundCpuJob('content-analysis.staydown-hash')
      const job = await trackMutation(signal, () =>
        queue.add(definition.name, {}, { ...definition.options, attempts: 1 }),
      )
      if (!job) throw new Error('Expected staydown hash job')

      const [event] = await failed
      expect(event).toMatchObject({ jobId: job.id })
      const stored = await queue.getJob(job.id)
      expect(await stored?.getState()).toBe('failed')
    })
  })

  it('fails an unknown job without retrying it', async ({ signal }) => {
    const { queue, events } = await startWorker(signal)
    const failed = waitForQueueDomainTestResult(once(events, 'failed', { signal }), signal)
    const job = await trackMutation(signal, () =>
      queue.add('content-analysis.unknown', {}, { attempts: 3, priority: 10 }),
    )
    if (!job) throw new Error('Expected unknown CPU job')

    const [event] = await failed
    expect(event).toMatchObject({ jobId: job.id })
    const stored = await queue.getJob(job.id)
    expect(await stored?.getState()).toBe('failed')
    expect(stored?.attemptsMade).toBeLessThan(3)
  })

  it('rejects a malformed Bedrock reconciliation before reading entities', async ({ signal }) => {
    const { queue, events } = await startWorker(signal, ['bedrock-embeddings'])
    const failed = waitForQueueDomainTestResult(once(events, 'failed', { signal }), signal)
    const definition = requireBackgroundCpuJob('bedrock-embeddings.reconcile_existing')
    const job = await trackMutation(signal, () =>
      queue.add(definition.name, { entityType: 'unknown' }, definition.options),
    )
    if (!job) throw new Error('Expected reconciliation job')

    const [event] = await failed
    expect(event).toMatchObject({ jobId: job.id })
    const stored = await queue.getJob(job.id)
    expect(await stored?.getState()).toBe('failed')
  })

  it('parks a registered job outside its selected domain without spending an attempt', async ({
    signal,
  }) => {
    const { queue, events } = await startWorker(signal)
    const delayed = waitForQueueDomainTestResult(once(events, 'delay-changed', { signal }), signal)
    const definition = requireBackgroundCpuJob('bedrock-embeddings.post')
    const job = await trackMutation(signal, () =>
      queue.add(definition.name, { id: randomUUID() }, definition.options),
    )
    if (!job) throw new Error('Expected Bedrock CPU job')

    const [event] = await delayed
    expect(event).toMatchObject({ jobId: job.id })
    const stored = await queue.getJob(job.id)
    expect(await stored?.getState()).toBe('delayed')
    expect(stored?.attemptsMade).toBe(0)
  })

  describe('while owning the content pause', () => {
    beforeEach(async ({ signal }) => {
      reservation = acquireContentAnalysisTestReservation('exclusive')
      await reservation
      signal.throwIfAborted()
    })

    it('defers a paused domain job without invoking its handler or spending an attempt', async ({
      signal,
    }) => {
      const domain = 'content-analysis'
      let actorId: string | undefined
      let watcherPending: ReturnType<typeof watchQueueDomainControls> | undefined
      let pausePending: ReturnType<typeof pauseQueueDomain> | undefined
      let restoreConfig: (() => void) | undefined
      const pauseInvalidated = Promise.withResolvers<void>()
      const resumeInvalidated = Promise.withResolvers<void>()
      let changes = 0
      let cleaning: Promise<void> | undefined
      pauseCleanup = () =>
        (cleaning ??= (async () => {
          try {
            await Promise.allSettled(pausePending ? [pausePending] : [])
            if (pausePending) {
              const control = await getQueueDomainControl(domain)
              if (control.paused && control.pausedBy === actorId) {
                await resumeQueueDomain(domain)
                if (!signal.aborted)
                  await waitForQueueDomainTestResult(resumeInvalidated.promise, signal)
              } else if (control.paused)
                throw new Error('Content pause ownership changed during fixture cleanup')
            }
          } finally {
            await closeQueueDomainTestWatcher(watcherPending, restoreConfig)
          }
        })())
      try {
        expect((await getQueueDomainControl(domain)).paused).toBe(false)
        const user = await trackMutation(signal, () => createTestUserDirect())
        actorId = user.id
        signal.throwIfAborted()
        watcherPending = watchQueueDomainControls(changed => {
          if (changed !== domain) return
          changes += 1
          if (changes === 1) pauseInvalidated.resolve()
          if (changes === 2) resumeInvalidated.resolve()
        })
        await watcherPending
        signal.throwIfAborted()
        // Keep the real recheck/event while bounding this fixture's polling interval.
        restoreConfig = overrideDynamicConfigFieldsForTest(backgroundCpuQueueConfig, {
          pause_recheck_ms: 100,
        })
        const { queue, events } = await startWorker(signal)
        const delayed = waitForQueueDomainTestResult(
          once(events, 'delay-changed', { signal }),
          signal,
        )
        pausePending = trackMutation(signal, () => pauseQueueDomain(domain, { userId: user.id }))
        await pausePending
        await waitForQueueDomainTestResult(pauseInvalidated.promise, signal)
        const definition = requireBackgroundCpuJob('content-analysis.post')
        const job = await trackMutation(signal, () =>
          queue.add(definition.name, { id: randomUUID() }, definition.options),
        )
        if (!job) throw new Error('Expected paused content-analysis job')
        const [event] = await delayed
        expect(event).toMatchObject({ jobId: job.id })
        const stored = await queue.getJob(job.id)
        expect(await stored?.getState()).toBe('delayed')
        expect(stored?.attemptsMade).toBe(0)
      } finally {
        await pauseCleanup()
      }
    })
  })
})
