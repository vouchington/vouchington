import { randomUUID } from 'node:crypto'
import { closeEmbeddingCreationResources } from './embedding-creation-resource-close.mts'
import { Queue, QueueEvents, type Worker, type Job, type QueueEventsOptions } from 'glide-mq'
import type { acquireEmbeddingQuotaFixture } from './embedding-creation-quota.mts'
import { registerEmbeddingCreationDiagnostics } from './embedding-creation-diagnostics.mts'
import {
  createOwnedQueueEventWaits,
  type OwnedQueueEventName,
} from './embedding-creation-event-waits.mts'
import { createQueueLifetime } from './embedding-creation-lifetime.mts'

type Fixture = Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>
type QueueLifetime = Pick<Fixture, 'assertOpen' | 'beforeRelease'>

/** Observes committed stream transitions on an owned real queue, not worker emptiness. */
export function createOwnedEmbeddingQueue(
  fixture: Pick<Fixture, 'assertOpen' | 'beforeRelease'>,
  label: string,
  options: Pick<QueueEventsOptions, 'connection' | 'prefix'>,
  name = `embedding_creation_${label}_${randomUUID()}`,
) {
  return createOwnedQueue(fixture, options, name)
}

/** Owns native queue resources for controls with no PostgreSQL accounting or config effects. */
export function createOwnedEmbeddingQueueWithoutQuota(
  label: string,
  options: Pick<QueueEventsOptions, 'connection' | 'prefix'>,
  name = `embedding_creation_${label}_${randomUUID()}`,
) {
  return createOwnedQueue(createQueueLifetime(), options, name)
}

function createOwnedQueue(
  fixture: QueueLifetime,
  options: Pick<QueueEventsOptions, 'connection' | 'prefix'>,
  name: string,
) {
  fixture.assertOpen()
  let queue: Queue | undefined
  const workers: Worker[] = []
  const writes: Promise<unknown>[] = []
  const creations: Promise<Worker>[] = []
  const release: Array<() => void> = []
  let events: QueueEvents | undefined
  let closing: Promise<void> | undefined
  let accepting = true
  let writersDrained = false
  const cleanup = () => {
    accepting = false
    if (!queue) {
      writersDrained = true
      return Promise.resolve()
    }
    return (closing ??= close())
  }
  // Register the idempotent drain before any SDK object can acquire native resources.
  fixture.beforeRelease(cleanup, () => writersDrained)
  const queueHandle = new Queue(name, options)
  queue = queueHandle
  const eventWaits = createOwnedQueueEventWaits(name)
  let pendingAtClose: Array<{ id: string; event: string; occurrence: number }> | undefined
  const diagnostics = registerEmbeddingCreationDiagnostics(queueHandle.name, () => ({
    prefix: options.prefix,
    closing: closing !== undefined,
    writersDrained,
    pending: pendingAtClose ?? eventWaits.pending(),
    history: eventWaits.history(),
  }))
  const onError = eventWaits.onError
  queueHandle.on('error', onError)
  fixture.assertOpen()
  events = new QueueEvents(name, { ...options, lastEventId: '0-0' })
  for (const event of ['added', 'delay-changed', 'completed', 'failed'] as const)
    events.on(event, (payload: { jobId: string }) => eventWaits.record(payload.jobId, event))
  events.on('error', onError)

  function track<T>(write: Promise<T>): Promise<T> {
    writes.push(write)
    void write.catch(() => {})
    return write
  }
  function assertOpen() {
    fixture.assertOpen()
    if (!accepting) throw new Error('Owned embedding queue is closing')
  }
  function start<T>(action: () => Promise<T>): Promise<T> {
    assertOpen()
    return track(Promise.resolve().then(action))
  }
  function watchWorker<T extends Worker>(worker: T): T {
    workers.push(worker)
    worker.on('error', onError)
    return worker
  }
  return {
    queue: queueHandle,
    workers,
    diagnostics,
    /** Register ownership before factory effects; closing still retains a late returned worker. */
    createWorker: <T extends Worker>(factory: () => T | Promise<T>): Promise<T> => {
      assertOpen()
      const creation = Promise.resolve().then(factory).then(watchWorker)
      creations.push(creation)
      void creation.catch(() => {})
      return creation
    },
    options,
    cleanup,
    run: async <T,>(action: () => Promise<T>): Promise<T> => {
      assertOpen()
      let result: T
      try {
        result = await action()
      } catch (err) {
        const [disposed] = await Promise.allSettled([cleanup()])
        if (disposed?.status === 'rejected')
          throw new AggregateError([err, disposed.reason], 'Embedding action and cleanup failed', {
            cause: err,
          })
        throw err
      }
      await cleanup()
      return result
    },
    ready: () => start(() => events!.waitUntilReady()),
    promote: (job: Pick<Job, 'promote'>) => start(() => job.promote()),
    /** A zero-delay continuation may already be promoted; require its actual completion. */
    promoteContinuation: (job: Pick<Job, 'promote'>, completed: Promise<void>) =>
      start(() =>
        job.promote().catch(async err => {
          if (!(err instanceof Error) || err.message !== 'Cannot promote: not_delayed') throw err
          await completed
        }),
      ),
    add: (...args: Parameters<Queue['add']>) => start(() => queueHandle.add(...args)),
    releaseOnCleanup: (action: () => void) => {
      assertOpen()
      release.push(action)
    },
    waitFor: (id: string, event: OwnedQueueEventName, occurrence = 1): Promise<void> => {
      assertOpen()
      return eventWaits.waitFor(id, event, occurrence)
    },
  }

  async function close() {
    const errors: unknown[] = []
    const attempt = async (action: () => unknown) => {
      try {
        await action()
      } catch (err) {
        errors.push(err)
      }
    }
    pendingAtClose = eventWaits.pending()
    eventWaits.close()
    for (const action of release) await attempt(action)
    const resources = await closeEmbeddingCreationResources({
      queue: queueHandle,
      events,
      workers,
      creations,
      writes,
      options,
      onError,
    })
    errors.push(...resources.errors)
    writersDrained = resources.writersDrained
    // An SDK error can arrive after the last wait resolves, including during close.
    const eventError = eventWaits.error()
    if (eventError.present) errors.push(eventError.value)
    for (const worker of workers) worker.off('error', onError)
    if (errors.length)
      throw new AggregateError(
        errors,
        writersDrained
          ? 'Owned embedding queue cleanup failed'
          : 'Owned embedding worker drain failed; queue obliteration and config/accounting restoration withheld',
        { cause: errors[0] },
      )
  }
}
