import { nativeGlideMq } from './native-glide-mq.mts'
import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import type { Queue, Worker, Job, JobOptions, WorkerOptions } from 'glide-mq'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

export type RealGlideConnection = Pick<WorkerOptions, 'connection' | 'prefix'>
export type RealGlideProcessor = (job: Job) => Promise<unknown>
type Terminal = 'completed' | 'failed'
type JobDefinition = { readonly name: string; readonly options: Readonly<JobOptions> }

export type RealGlideBackgroundHarness<TJob extends JobDefinition> = {
  queue: Queue
  add(job: TJob, data: object, options?: JobOptions): Promise<Job>
  settled(job: { id: string }): Promise<Terminal>
  activated(job: { id: string }, times: number): Promise<void>
  stalledJobIds: readonly string[]
  registerBeforeClose(release: () => void | Promise<void>): void
  close(): Promise<void>
}

/** Owns an isolated real GlideMQ queue and its event-based worker lifecycle. */
export async function startRealGlideBackgroundLifecycle<TJob extends JobDefinition>(options: {
  queueNamePrefix: string
  connection: RealGlideConnection
  processor: RealGlideProcessor
  workers?: number
  concurrency?: number
  workerOptions?: Partial<WorkerOptions>
}): Promise<RealGlideBackgroundHarness<TJob>> {
  // This helper promises native execution even when ordinary service admissions use TestQueue.
  const { Queue, Worker } = nativeGlideMq
  const { connection, processor, workers = 1, concurrency = 1 } = options
  const queueName = `${options.queueNamePrefix}_${randomUUID()}`
  const queue = new Queue(queueName, connection)
  let closing = false
  let closePromise: Promise<void> | undefined
  let startup = Promise.resolve()
  const work: Promise<void>[] = []
  const releases: (() => void | Promise<void>)[] = []
  const workerErrors: unknown[] = []
  const started: Worker[] = []
  const observe = <Result,>(operation: Promise<Result>): Promise<Result> => {
    work.push(
      operation.then(
        () => undefined,
        () => undefined,
      ),
    )
    return operation
  }
  const runProcessor: RealGlideProcessor = job =>
    observe(Promise.resolve().then(() => processor(job)))
  // Register before any worker readiness wait. Closing never awaits the arbitrary test body.
  onTestFinished(close)
  const pending = new Map<string, PromiseWithResolvers<Terminal>>()
  const deferredFor = (id: string) => {
    const existing = pending.get(id)
    if (existing) return existing
    const created = Promise.withResolvers<Terminal>()
    void created.promise.catch(() => undefined)
    pending.set(id, created)
    return created
  }
  const stalledJobIds: string[] = []
  const activations = new Map<string, number>()
  const activationWaiters: {
    id: string
    times: number
    resolve: () => void
    reject: (error: Error) => void
  }[] = []
  for (let index = 0; index < workers; index += 1) {
    started.push(
      new Worker(queueName, runProcessor, {
        ...connection,
        // A graceful close waits out the in-flight blocking read, so keep that read short.
        blockTimeout: 1_000,
        promotionInterval: 50,
        concurrency,
        ...options.workerOptions,
      }),
    )
  }
  for (const worker of started) {
    worker.on('error', error => workerErrors.push(error))
    worker.on('stalled', jobId => stalledJobIds.push(jobId))
    worker.on('active', (_job, jobId) => {
      const count = (activations.get(jobId) ?? 0) + 1
      activations.set(jobId, count)
      for (const waiter of activationWaiters) {
        if (waiter.id === jobId && count >= waiter.times) waiter.resolve()
      }
    })
    worker.on('completed', job => deferredFor(job.id).resolve('completed'))
    worker.on('failed', (job, error) => {
      // Native failed also fires for retriable attempts; settled means a terminal receipt.
      if (
        job &&
        (job.discarded ||
          error.name === 'UnrecoverableError' ||
          job.attemptsMade + 1 >= (job.opts.attempts ?? 1))
      )
        deferredFor(job.id).resolve('failed')
    })
  }
  startup = Promise.all(started.map(worker => worker.waitUntilReady())).then(() => undefined)
  try {
    await startup
  } catch (err) {
    const primary = err
    try {
      await close()
    } catch (err) {
      throw new AggregateError([primary, err], 'Background startup and cleanup failed', {
        cause: err,
      })
    }
    throw primary
  }
  if (closing) throw new Error('Background harness closed during startup')
  return {
    queue,
    stalledJobIds,
    add: async (job, data, jobOptions) => {
      if (closing) throw new Error('Background harness admission is closed')
      const added = await observe(queue.add(job.name, data, { ...job.options, ...jobOptions }))
      if (!added) throw new Error(`Expected ${job.name} to be added`)
      return added
    },
    settled: job => waitForRealGlideEvent(deferredFor(job.id).promise, `GlideMQ job ${job.id}`),
    activated: (job, times) => {
      if ((activations.get(job.id) ?? 0) >= times) return Promise.resolve()
      const waiting = Promise.withResolvers<void>()
      void waiting.promise.catch(() => undefined)
      activationWaiters.push({
        id: job.id,
        times,
        resolve: waiting.resolve,
        reject: waiting.reject,
      })
      return waitForRealGlideEvent(waiting.promise, `GlideMQ job ${job.id} activation ${times}`)
    },
    registerBeforeClose: release => {
      if (closing) throw new Error('Background harness cleanup registration is closed')
      releases.push(release)
    },
    close,
  }

  function close(): Promise<void> {
    closing = true
    closePromise ??= drain()
    return closePromise
  }

  async function drain(): Promise<void> {
    // Release fixture-held processors/locks before physically joining their native workers.
    // These callbacks never await the arbitrary test body.
    const released = await Promise.allSettled(
      releases.map(release => Promise.resolve().then(release)),
    )
    // Startup may fail, but every constructed worker must still be physically joined.
    await startup.catch(() => undefined)
    const stopped = await Promise.allSettled(started.map(worker => worker.close()))
    // Worker.close() joins its native processing tail, including completed/failed settlement.
    // Only now is the processor list stable and safe to snapshot.
    await Promise.all(work)
    const failures = [...workerErrors]
    for (const result of released) if (result.status === 'rejected') failures.push(result.reason)
    for (const result of stopped) if (result.status === 'rejected') failures.push(result.reason)
    const closed = new Error('Background harness closed before the requested receipt')
    for (const deferred of pending.values()) deferred.reject(closed)
    for (const waiter of activationWaiters) waiter.reject(closed)
    if (failures.length === 0) {
      try {
        await queue.obliterate({ force: false })
      } catch (err) {
        failures.push(err)
      }
    }
    // Retain job records on failed drain, but never retain this queue's native connection.
    try {
      await queue.close()
    } catch (err) {
      failures.push(err)
    }
    if (failures.length) {
      throw new AggregateError(
        failures,
        'Background harness cleanup failed; owned records retained',
      )
    }
  }
}
