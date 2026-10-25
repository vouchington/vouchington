import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Queue, QueueEvents } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { languageDetectionWorkConfig } from '@services/language-detection/work-limits'
import {
  createLanguageBackfillWindow,
  languageBackfillTables,
} from '@voucha/test-helpers/language-backfill-window'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getLanguageDetectionResultForTest } from '@voucha/test-helpers/sql-language-detection-state'
import {
  acquireContentAnalysisTestReservation,
  waitForQueueDomainTestResult,
} from '@voucha/test-helpers/queue-domain-controls'
import { createBackgroundCpuWorker } from '../workers/create-worker.mts'
import { BACKGROUND_CPU_HANDLERS } from '../processors/handlers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('real CPU language backfill retained progress', () => {
  let queue: Queue | undefined
  let events: QueueEvents | undefined
  let worker: ReturnType<typeof createBackgroundCpuWorker> | undefined
  let reservation: ReturnType<typeof acquireContentAnalysisTestReservation> | undefined
  let restoreConfig: (() => void) | undefined
  let mutations: Promise<unknown>[]
  let cleanup: () => Promise<void>
  let currentSignal: AbortSignal

  beforeEach(context => {
    currentSignal = context.signal
    queue = undefined
    events = undefined
    worker = undefined
    reservation = undefined
    restoreConfig = undefined
    mutations = []
    let closing: Promise<void> | undefined
    cleanup = () =>
      (closing ??= (async () => {
        await using resources = new AsyncDisposableStack()
        resources.defer(async () => {
          await (await reservation)?.release()
        })
        resources.defer(() => restoreConfig?.())
        resources.defer(async () => {
          await queue?.close()
        })
        resources.defer(async () => {
          await queue?.obliterate({ force: true })
        })
        resources.defer(async () => {
          await events?.close()
        })
        resources.defer(async () => {
          if (worker) await closeAndUnregisterGlideMQInstance(worker)
        })
        // No operation can begin after abort; drain already-started fixture/enqueue work first.
        await Promise.allSettled(mutations)
      })())
    context.onTestFinished(cleanup)
  })
  afterEach(() => cleanup())

  function mutate<T>(signal: AbortSignal, start: () => Promise<T>): Promise<T> {
    signal.throwIfAborted()
    const operation = start()
    mutations.push(operation)
    return operation
  }

  it.each(languageBackfillTables)('persists two-page queued %s progress', async table => {
    const signal = currentSignal
    signal.throwIfAborted()
    reservation = acquireContentAnalysisTestReservation('shared')
    await waitForQueueDomainTestResult(reservation, signal)
    await languageDetectionWorkConfig.waitForInitialization()
    signal.throwIfAborted()
    restoreConfig = overrideDynamicConfigFieldsForTest(languageDetectionWorkConfig, {
      backfill_batch_size: 2,
      backfill_max_rows_per_run: 2,
    })

    const fixture = await waitForQueueDomainTestResult(
      mutate(signal, () => createLanguageBackfillWindow(table)),
      signal,
    )
    const negativesBefore = await Promise.all(
      [fixture.lowerId, fixture.laterId].map(id => getLanguageDetectionResultForTest(table, id)),
    )
    const ownedBefore = await Promise.all(
      fixture.ids.map(id => getLanguageDetectionResultForTest(table, id)),
    )
    for (const state of [...ownedBefore, ...negativesBefore]) {
      expect(state).toEqual({
        lingua_rs_detected_language: null,
        lingua_rs_content_sha256: null,
        lingua_rs_input_sha256: null,
        lingua_rs_results: null,
        lingua_rs_detected_at: null,
      })
    }
    signal.throwIfAborted()
    const prefix = `${workerQueuePrefix}-language-backfill-${randomUUID()}`
    queue = new Queue(BACKGROUND_CPU_QUEUE_NAME, { connection: workerQueueConnection, prefix })
    events = new QueueEvents(BACKGROUND_CPU_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
      lastEventId: '0',
    })
    worker = createBackgroundCpuWorker({
      handlers: BACKGROUND_CPU_HANDLERS,
      domains: ['content-analysis'],
      prefix,
      // Keep idle reads and delayed promotion short on this isolated test queue.
      blockTimeout: 1_000,
      promotionInterval: 2_500,
    })
    const activeCursors: unknown[] = []
    const failures: unknown[] = []
    const errors: unknown[] = []
    const delayedIds: string[] = []
    worker.on('active', job => activeCursors.push(structuredClone(job.data)))
    const workerFailure = Promise.withResolvers<never>()
    worker.on('failed', (job, err) => {
      failures.push({ id: job?.id, err })
      workerFailure.reject(err)
    })
    worker.on('error', err => {
      errors.push(err)
      workerFailure.reject(err)
    })
    events.on('delay-changed', event => delayedIds.push(event.jobId))
    const completed = waitForQueueDomainTestResult(
      Promise.race([once(events, 'completed', { signal }), workerFailure.promise]),
      signal,
    )
    await waitForQueueDomainTestResult(
      Promise.all([worker.waitUntilReady(), events.waitUntilReady()]),
      signal,
    )
    const definition = requireBackgroundCpuJob(`content-analysis.backfill_${table}`)
    const liveQueue = queue
    const job = await mutate(signal, () =>
      liveQueue.add(definition.name, { cursor: fixture.cursor }, definition.options),
    )
    if (!job) throw new Error('Expected retained language backfill job')
    const [event] = await completed
    expect(event).toMatchObject({ jobId: job.id })
    expect(failures).toEqual([])
    expect(errors).toEqual([])
    expect(delayedIds).toEqual([job.id])
    expect(activeCursors).toEqual([
      { cursor: fixture.cursor },
      { cursor: { ...fixture.cursor, afterId: fixture.ids[1] } },
    ])
    const stored = await queue.getJob(job.id)
    expect(await stored?.getState()).toBe('completed')
    expect(stored?.data).toEqual({ cursor: { ...fixture.cursor, afterId: fixture.upper } })
    expect(stored?.returnvalue).toEqual({ updated: 1, hasMore: false })
    expect(stored?.attemptsMade).toBe(0)

    for (const id of fixture.ids) {
      const expectedText = fixture.expectedTextForId(id)
      const contentDigest = createHash('sha256').update(expectedText).digest()
      const inputDigest = createHash('sha256').update(`${expectedText}\0`).digest()
      const state = await getLanguageDetectionResultForTest(table, id)
      expect(state.lingua_rs_detected_language).toBe('en')
      expect(state.lingua_rs_content_sha256).toEqual(contentDigest)
      expect(state.lingua_rs_input_sha256).toEqual(inputDigest)
      expect(state.lingua_rs_detected_at).toBeInstanceOf(Date)
      expect(state.lingua_rs_results).toMatchObject({
        source: 'lingua',
        languages: expect.arrayContaining([expect.objectContaining({ iso6391: 'en' })]),
      })
    }
    await expect(
      Promise.all(
        [fixture.lowerId, fixture.laterId].map(id => getLanguageDetectionResultForTest(table, id)),
      ),
    ).resolves.toEqual(negativesBefore)
  })
})
