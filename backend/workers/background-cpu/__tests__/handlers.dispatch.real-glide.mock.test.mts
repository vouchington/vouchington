import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Queue, QueueEvents } from 'glide-mq'
import {
  closeAndUnregisterGlideMQInstance,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { BACKGROUND_CPU_QUEUE_NAME, type BackgroundCpuDomain } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import {
  acquireContentAnalysisTestReservation,
  waitForQueueDomainTestResult,
} from '@voucha/test-helpers/queue-domain-controls'
import { createBackgroundCpuWorker } from '../workers/create-worker.mts'
import { BACKGROUND_CPU_HANDLERS } from '../processors/handlers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('background-cpu production routing through real GlideMQ', () => {
  let queue: Queue | undefined
  let worker: ReturnType<typeof createBackgroundCpuWorker> | undefined
  let events: QueueEvents | undefined
  let reservation: ReturnType<typeof acquireContentAnalysisTestReservation> | undefined
  let cleanup: () => Promise<void>
  let mutations: Promise<unknown>[]
  let currentSignal: AbortSignal

  beforeEach(context => {
    currentSignal = context.signal
    reservation = undefined
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
      promotionInterval: 2_500,
    })
    worker.on('error', () => undefined)
    await Promise.all([worker.waitUntilReady(), events.waitUntilReady()])
    signal.throwIfAborted()
    return { queue, events, worker }
  }

  async function reserveContentAnalysis(signal: AbortSignal) {
    signal.throwIfAborted()
    reservation = acquireContentAnalysisTestReservation('shared')
    await reservation
    signal.throwIfAborted()
  }

  it.each([
    {
      name: 'crawl.crawl_url',
      domain: 'crawl',
      data: {},
      message: 'Crawl URL job .url_id is required',
    },
    {
      name: 'crawl.boilerplate_removal',
      domain: 'crawl',
      data: {},
      message: 'Boilerplate removal job requires .hostname_id and .parent_path',
    },
    {
      name: 'crawl.crawl_referral_link',
      domain: 'crawl',
      data: {},
      message: 'Crawl referral link job .linkId is required',
    },
    {
      name: 'crawl.unfurl_referral_link',
      domain: 'crawl',
      data: {},
      message: 'Unfurl referral link job .parentLinkId is required',
    },
    {
      name: 'bedrock-embeddings.post',
      domain: 'bedrock-embeddings',
      data: {},
      message: 'Post job requires id in job.data',
    },
    {
      name: 'ai-spend-cap.recheck',
      domain: 'ai-spend-cap',
      data: { day: 'invalid', generation: randomUUID() },
      message: 'Invalid UTC day: invalid',
    },
  ] as const)('rejects malformed $name payloads in their domain runner', async testCase => {
    const signal = currentSignal
    const { queue, events, worker } = await startWorker(signal, [testCase.domain])
    const failed = waitForQueueDomainTestResult(once(events, 'failed', { signal }), signal)
    const workerFailed = waitForQueueDomainTestResult(once(worker, 'failed', { signal }), signal)
    const activeJobIds: string[] = []
    worker.on('active', activeJob => activeJobIds.push(activeJob.id))
    const definition = requireBackgroundCpuJob(testCase.name)
    const job = await trackMutation(signal, () =>
      queue.add(definition.name, testCase.data, { ...definition.options, attempts: 1 }),
    )
    if (!job) throw new Error('Expected malformed CPU job')

    const [[event], [failedJob, error]] = await Promise.all([failed, workerFailed])
    expect(event).toMatchObject({ jobId: job.id, failedReason: testCase.message })
    expect(failedJob).toMatchObject({ id: job.id, failedReason: testCase.message })
    expect(activeJobIds.filter(id => id === job.id)).toEqual([job.id])
    expect(error).toMatchObject({ message: testCase.message })
    const stored = await queue.getJob(job.id)
    const storedFailure = stored
      ? {
          state: await stored.getState(),
          failedReason: stored.failedReason,
          attemptsMade: stored.attemptsMade,
        }
      : null
    expect(storedFailure).toEqual(
      definition.options.removeOnFail === true
        ? null
        : { state: 'failed', failedReason: testCase.message, attemptsMade: 1 },
    )
  })

  it('acknowledges a staydown job for an image that no longer exists', async ({ signal }) => {
    await reserveContentAnalysis(signal)
    const { queue, events } = await startWorker(signal)
    const completed = waitForQueueDomainTestResult(once(events, 'completed', { signal }), signal)
    const definition = requireBackgroundCpuJob('content-analysis.staydown-hash')
    const job = await trackMutation(signal, () =>
      queue.add(definition.name, { id: randomUUID() }, definition.options),
    )
    if (!job) throw new Error('Expected missing-image CPU job')

    const [event] = await completed
    expect(event).toMatchObject({ jobId: job.id })
    const stored = await queue.getJob(job.id)
    expect(await stored?.getState()).toBe('completed')
    expect(stored?.returnvalue).toEqual({ success: true })
  })

  it('completes an exhausted language backfill without changing its retained cursor', async ({
    signal,
  }) => {
    await reserveContentAnalysis(signal)
    const { queue, events } = await startWorker(signal)
    const completed = waitForQueueDomainTestResult(once(events, 'completed', { signal }), signal)
    const definition = requireBackgroundCpuJob('content-analysis.backfill_users')
    const cursor = { sweepStartedAt: '1970-01-01T00:00:00.000Z' }
    const job = await trackMutation(signal, () =>
      queue.add(definition.name, { cursor }, definition.options),
    )
    if (!job) throw new Error('Expected retained language backfill CPU job')

    const [event] = await completed
    expect(event).toMatchObject({ jobId: job.id })
    const stored = await queue.getJob(job.id)
    expect(await stored?.getState()).toBe('completed')
    expect(stored?.data).toEqual({ cursor })
    expect(stored?.returnvalue).toEqual({ updated: 0, hasMore: false })
  })
})
