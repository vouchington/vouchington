import { once } from 'node:events'
import { randomUUID, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Queue, QueueEvents, Worker, type Job } from 'glide-mq'
import {
  createQueue,
  closeAndUnregisterGlideMQInstance,
  processRetainedSweep,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { waitForQueueDomainTestResult } from '@voucha/test-helpers/queue-domain-controls'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { IMAGE_UPLOADS_QUEUE_NAME } from '@queues/image-uploads/config'
import { createTestUser, setImageHashAndProcessing } from '@voucha/test-helpers'
import {
  insertOwnedUploadCleanupCluster,
  makeOwnedUploadCleanupSweep,
} from '@voucha/test-helpers/image-upload-cleanup'
import { cleanupAbandonedUploads } from '../cleanup-abandoned-uploads.mts'
import { getUploadCleanupResumeAt } from '../cleanup-upload-sweep.mts'
import { imagesWorkConfig } from '../work-limits.mts'
import type { CleanupAbandonedUploadsData } from '@queues/content-analysis/types'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('abandoned upload recovery backpressure', () => {
  it('keeps blocked recovery progress, caps a released page, and resumes through the real retained job', async context => {
    await imagesWorkConfig.waitForInitialization()
    const user = await createTestUser()
    const now = new Date()
    const ids = await insertOwnedUploadCleanupCluster(
      user.id,
      2,
      new Date(now.getTime() - 2 * 60 * 60 * 1000),
    )
    await Promise.all(ids.map(id => setImageHashAndProcessing(id, randomBytes(32))))
    const sweep = await makeOwnedUploadCleanupSweep(ids, now)
    sweep.windows.staged.done = true
    sweep.windows.abandonment.done = true
    const prefix = workerQueuePrefix
    const targetName = `${IMAGE_UPLOADS_QUEUE_NAME}-recovery-depth-${randomUUID()}`
    const target = createQueue(targetName, { priorityKind: 'none' })
    const sourceName = `upload-recovery-control-${randomUUID()}`
    const source = new Queue<CleanupAbandonedUploadsData>(sourceName, {
      connection: workerQueueConnection,
      prefix,
    })
    const sourceEvents = new QueueEvents(sourceName, {
      connection: workerQueueConnection,
      prefix,
      lastEventId: '0',
    })
    const targetEvents = new QueueEvents(targetName, {
      connection: workerQueueConnection,
      prefix,
      lastEventId: '0',
    })
    const releaseActive = Promise.withResolvers<void>()
    const activeStarted = Promise.withResolvers<void>()
    const targetWorker = new Worker(
      targetName,
      async (job: Job) => {
        if (job.name !== 'capacity-active') throw new Error('Unexpected destination execution')
        activeStarted.resolve()
        await releaseActive.promise
      },
      { connection: workerQueueConnection, prefix, concurrency: 1, blockTimeout: 1000 },
    )
    let sourceWorker: Worker<CleanupAbandonedUploadsData> | undefined
    let restoreConfig: (() => void) | undefined
    const mutations: Promise<unknown>[] = []
    function mutate<T>(start: () => Promise<T>): Promise<T> {
      context.signal.throwIfAborted()
      const pending = start()
      mutations.push(pending)
      return pending
    }
    let closing: Promise<void> | undefined
    const close = () =>
      (closing ??= (async () => {
        releaseActive.resolve()
        await Promise.allSettled(mutations)
        await using resources = new AsyncDisposableStack()
        resources.defer(() => restoreConfig?.())
        resources.defer(() => closeAndUnregisterGlideMQInstance(target))
        resources.defer(() => source.close())
        resources.defer(() => target.obliterate({ force: true }))
        resources.defer(() => source.obliterate({ force: true }))
        resources.defer(() => targetEvents.close())
        resources.defer(() => sourceEvents.close())
        resources.defer(() => targetWorker.close())
        resources.defer(async () => {
          await sourceWorker?.close()
        })
      })())
    context.onTestFinished(close)
    try {
      await Promise.all([
        targetWorker.waitUntilReady(),
        sourceEvents.waitUntilReady(),
        targetEvents.waitUntilReady(),
      ])
      context.signal.throwIfAborted()
      const active = await mutate(() => target.add('capacity-active', {}, { priority: 0 }))
      if (!active) throw new Error('Missing active capacity control')
      await waitForQueueDomainTestResult(activeStarted.promise, context.signal)
      await mutate(() => target.pause())
      const waiting = await mutate(() => target.add('capacity-waiting', {}, { priority: 0 }))
      const delayed = await mutate(() =>
        target.add('capacity-delayed', {}, { priority: 0, delay: 60000 }),
      )
      if (!waiting || !delayed) throw new Error('Missing queue-depth controls')
      expect(await target.getJobCounts()).toMatchObject({ waiting: 1, active: 1, delayed: 1 })
      context.signal.throwIfAborted()
      restoreConfig = overrideDynamicConfigFieldsForTest(imagesWorkConfig, {
        recovery_max_depth: 3,
        recovery_backoff_ms: 1000,
      })
      sourceWorker = new Worker<CleanupAbandonedUploadsData>(
        sourceName,
        async (job: Job<CleanupAbandonedUploadsData>) => {
          if (!job.data.sweep) throw new Error('Missing retained cleanup snapshot')
          const pass = await cleanupAbandonedUploads(
            job.data.sweep,
            next => job.updateData({ sweep: next }),
            target,
          )
          return processRetainedSweep(job, async () => pass, {
            resumeAt: getUploadCleanupResumeAt(pass.recoveryBackpressured),
          })
        },
        {
          connection: workerQueueConnection,
          prefix,
          concurrency: 1,
          blockTimeout: 1000,
          promotionInterval: 25,
        },
      )
      sourceWorker.on('error', () => undefined)
      await sourceWorker.waitUntilReady()
      const firstDelay = once(sourceEvents, 'delay-changed', { signal: context.signal })
      void firstDelay.catch(() => {})
      const admittedAt = Date.now()
      const job = await mutate(() =>
        source.add('cleanup-owned-window', { sweep }, { priority: 0, attempts: 3 }),
      )
      if (!job) throw new Error('Missing retained maintenance job')
      const [firstEvent] = await firstDelay
      expect(firstEvent).toMatchObject({ jobId: job.id })
      let stored = await source.getJob(job.id)
      expect(await stored?.getState()).toBe('delayed')
      expect(stored?.attemptsMade).toBe(0)
      expect(stored?.data).toEqual({ sweep })
      expect((await target.getJobs('waiting', 0, 10)).map(item => item.name)).toEqual([
        'capacity-waiting',
      ])
      const resumeEvents = new AbortController()
      const resumeSignal = AbortSignal.any([context.signal, resumeEvents.signal])
      const secondDelay = once(sourceEvents, 'delay-changed', { signal: resumeSignal })
      const prematureCompletion = once(sourceEvents, 'completed', { signal: resumeSignal })
      void secondDelay.catch(() => {})
      void prematureCompletion.catch(() => {})
      try {
        await mutate(() => waiting.remove())
        const resumed = await Promise.race([
          secondDelay.then(() => 'delayed' as const),
          prematureCompletion.then(() => 'completed' as const),
        ])
        expect(resumed).toBe('delayed')
      } finally {
        resumeEvents.abort()
        await Promise.allSettled([secondDelay, prematureCompletion])
      }
      expect(Date.now() - admittedAt).toBeGreaterThanOrEqual(1000)
      stored = await source.getJob(job.id)
      expect(stored?.attemptsMade).toBe(0)
      expect(stored?.data.sweep?.windows.recovery.after?.id).toBe(ids[0])
      expect(stored?.data.sweep?.windows.recovery.done).toBe(false)
      const extraction = await target.getJobs('waiting', 0, 10)
      expect(extraction.map(item => item.data)).toEqual([{ id: ids[0] }])
      expect(await target.getJobCounts()).toMatchObject({ waiting: 1, active: 1, delayed: 1 })
      const completion = once(sourceEvents, 'completed', { signal: context.signal })
      void completion.catch(() => {})
      await mutate(() => delayed.remove())
      await completion
      stored = await source.getJob(job.id)
      expect(await stored?.getState()).toBe('completed')
      expect(stored?.data.sweep?.windows.recovery.done).toBe(true)
      expect(stored?.data.sweep?.windows.recovery.after?.id).toBe(ids[1])
      expect(stored?.attemptsMade).toBe(0)
      expect((await target.getJobs('waiting', 0, 10)).map(item => item.data)).toEqual(
        ids.map(id => ({ id })),
      )
    } finally {
      await close()
    }
  })
})
