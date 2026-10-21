import { randomUUID, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { Queue, QueueEvents } from 'glide-mq'
import {
  closeAndUnregisterGlideMQInstance,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import {
  onEnqueueAdmission,
  type EnqueueAdmission,
} from '@data-stores/valkey-glide-mq/glide-mq-admission'
import {
  acquireContentAnalysisTestReservation,
  waitForQueueDomainTestResult,
} from '@voucha/test-helpers/queue-domain-controls'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import {
  createTestUser,
  backdateImageUploadStagedAt,
  setImageHashAndProcessing,
  readEnqueuedJob,
} from '@voucha/test-helpers'
import {
  insertOwnedUploadCleanupCluster,
  makeOwnedUploadCleanupSweep,
} from '@voucha/test-helpers/image-upload-cleanup'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import { getImageById } from '@services/images/get'
import { getImagesWorkLimit } from '@services/images/work-limits'
import { createBackgroundCpuWorker } from '../workers/create-worker.mts'
import { BACKGROUND_CPU_HANDLERS } from '../processors/handlers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('background CPU abandoned upload cleanup', () => {
  it('cleans abandoned uploads through a real retained CPU job without touching outside its window', async context => {
    let reservation: ReturnType<typeof acquireContentAnalysisTestReservation> | undefined
    let closeQueueResources: (() => Promise<void>) | undefined
    const mutations: Promise<unknown>[] = []
    let finished: Promise<void> | undefined
    const close = () =>
      (finished ??= (async () => {
        try {
          await closeQueueResources?.()
        } finally {
          await (await reservation)?.release()
        }
      })())
    context.onTestFinished(close)
    reservation = acquireContentAnalysisTestReservation('shared')
    await waitForQueueDomainTestResult(reservation, context.signal)
    context.signal.throwIfAborted()
    const depth = await imageUploadsQueue.getJobCounts()
    const unfinished = depth.waiting + depth.active + depth.delayed
    // Default extraction queue needs spare capacity for this owned recovery admission.
    expect(unfinished).toBeLessThan(getImagesWorkLimit('recovery_max_depth'))
    context.signal.throwIfAborted()
    const user = await createTestUser()
    const now = new Date()
    const stagedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000)
    const ids = await insertOwnedUploadCleanupCluster(user.id, 4, stagedAt)
    const [completedId, recoveryId, abandonedId, outsideId] = ids
    if (!completedId || !recoveryId || !abandonedId || !outsideId)
      throw new Error('Missing upload fixtures')
    await backdateImageUploadStagedAt(completedId, stagedAt, 'complete')
    await setImageHashAndProcessing(recoveryId, randomBytes(32))
    const outsideBefore = await getImageById(outsideId, true)
    const sweep = await makeOwnedUploadCleanupSweep(ids.slice(0, 3), now)
    context.signal.throwIfAborted()
    const storage = installOwnedUploadCleanupStorage(ids.slice(0, 3))
    const prefix = `${workerQueuePrefix}-upload-cleanup-${randomUUID()}`
    const queue = new Queue(BACKGROUND_CPU_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
    })
    const events = new QueueEvents(BACKGROUND_CPU_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
      lastEventId: '0',
    })
    const worker = createBackgroundCpuWorker({
      handlers: BACKGROUND_CPU_HANDLERS,
      domains: ['content-analysis'],
      prefix,
      concurrency: 1,
    })
    worker.on('error', () => undefined)
    const admissions: EnqueueAdmission[] = []
    const off = onEnqueueAdmission(event => {
      const input = event.inputs[0]
      if (
        event.queue === imageUploadsQueue &&
        event.jobName === 'extract-metadata' &&
        typeof input === 'object' &&
        input !== null &&
        'id' in input &&
        input.id === recoveryId
      )
        admissions.push(event)
    })
    let closing: Promise<void> | undefined
    closeQueueResources = () =>
      (closing ??= (async () => {
        await Promise.allSettled(mutations)
        await using resources = new AsyncDisposableStack()
        resources.defer(() => storage.restore())
        resources.defer(() => off())
        resources.defer(() => queue.close())
        resources.defer(() => queue.obliterate({ force: true }))
        resources.defer(() => events.close())
        resources.defer(async () => {
          for (const admission of admissions) {
            const admitted = await readEnqueuedJob(imageUploadsQueue, await admission.completion)
            const data = admitted.data
            if (!data || typeof data !== 'object' || !('id' in data) || data.id !== recoveryId)
              throw new Error('Refusing foreign extraction removal')
            await admitted.remove()
          }
        })
        resources.defer(() => closeAndUnregisterGlideMQInstance(worker))
      })())
    try {
      await Promise.all([worker.waitUntilReady(), events.waitUntilReady()])
      context.signal.throwIfAborted()
      const completion = once(events, 'completed', { signal: context.signal })
      void completion.catch(() => {})
      const definition = requireBackgroundCpuJob('content-analysis.cleanup-abandoned-uploads')
      context.signal.throwIfAborted()
      const admission = queue.add(definition.name, { sweep }, definition.options)
      mutations.push(admission)
      const job = await admission
      if (!job) throw new Error('Cleanup job was not admitted')
      const [event] = await completion
      expect(event).toMatchObject({ jobId: job.id })
      const stored = await queue.getJob(job.id)
      expect(await stored?.getState()).toBe('completed')
      expect(stored?.returnvalue).toEqual({ cleaned: 1, recovered: 1, stagedSourcesDeleted: 2 })
      expect(stored?.data.sweep.windows.staged.done).toBe(true)
      expect(stored?.data.sweep.windows.recovery.done).toBe(true)
      expect(stored?.data.sweep.windows.abandonment.done).toBe(true)
      expect(storage.calls.map(call => call.Key).toSorted()).toEqual(
        [completedId, recoveryId, abandonedId].toSorted(),
      )
      expect(await getImageById(abandonedId)).toBeNull()
      expect(await getImageById(completedId)).not.toBeNull()
      expect(await getImageById(recoveryId)).not.toBeNull()
      expect(await getImageById(outsideId, true)).toEqual(outsideBefore)
      expect(admissions).toHaveLength(1)
      const extractionAdmission = admissions[0]
      if (!extractionAdmission) throw new Error('Missing owned recovery admission')
      expect(
        (await readEnqueuedJob(imageUploadsQueue, await extractionAdmission.completion)).data,
      ).toEqual({ id: recoveryId })
    } finally {
      await close()
    }
  })
})
