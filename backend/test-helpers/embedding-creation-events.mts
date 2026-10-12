import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, type Worker, type Job, type QueueEventsOptions } from 'glide-mq'
import type { acquireEmbeddingQuotaFixture } from './embedding-creation-quota.mts'
import { registerEmbeddingCreationDiagnostics } from './embedding-creation-diagnostics.mts'

type EventName = 'delay-changed' | 'completed' | 'failed'
type Fixture = Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>

/** Observes committed stream transitions on an owned real queue, not worker emptiness. */
export function createOwnedEmbeddingQueue(
  fixture: Fixture,
  label: string,
  options: Pick<QueueEventsOptions, 'connection' | 'prefix'>,
) {
  fixture.assertOpen()
  const name = `embedding_creation_${label}_${randomUUID()}`
  const queue = new Queue(name, options)
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
    return (closing ??= close())
  }
  fixture.beforeRelease(cleanup, () => writersDrained)
  const history = new Map<string, Map<EventName, number>>()
  const waits = new Set<{
    id: string
    event: EventName
    occurrence: number
    resolve(): void
    reject(error: unknown): void
  }>()
  let eventError: unknown
  let hasEventError = false
  const drainDiagnostics = registerEmbeddingCreationDiagnostics(queue, () => ({
    prefix: options.prefix,
    closing: closing !== undefined,
    writersDrained,
    pending: [...waits].map(({ id, event, occurrence }) => ({ id, event, occurrence })),
    history: [...history].map(([id, counts]) => ({ id, events: Object.fromEntries(counts) })),
  }))
  const onError = (error: unknown) => {
    eventError = error
    hasEventError = true
    for (const wait of waits) wait.reject(error)
    waits.clear()
  }
  queue.on('error', onError)
  fixture.assertOpen()
  events = new QueueEvents(name, { ...options, lastEventId: '0-0' })
  for (const event of ['delay-changed', 'completed', 'failed'] as const)
    events.on(event, (payload: { jobId: string }) => {
      const counts = history.get(payload.jobId) ?? new Map<EventName, number>()
      counts.set(event, (counts.get(event) ?? 0) + 1)
      history.set(payload.jobId, counts)
      for (const wait of waits)
        if (
          wait.id === payload.jobId &&
          wait.event === event &&
          (counts.get(event) ?? 0) >= wait.occurrence
        ) {
          waits.delete(wait)
          wait.resolve()
        }
    })
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
    queue,
    workers,
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
    add: (...args: Parameters<Queue['add']>) => start(() => queue.add(...args)),
    releaseOnCleanup: (action: () => void) => {
      assertOpen()
      release.push(action)
    },
    waitFor: (id: string, event: EventName, occurrence = 1): Promise<void> => {
      assertOpen()
      if (hasEventError)
        return Promise.reject(
          eventError instanceof Error
            ? eventError
            : new AggregateError([eventError], 'Owned queue SDK failed', { cause: eventError }),
        )
      if ((history.get(id)?.get(event) ?? 0) >= occurrence) return Promise.resolve()
      const completion = Promise.withResolvers<void>()
      void completion.promise.catch(() => {})
      waits.add({ id, event, occurrence, ...completion })
      return completion.promise
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
    for (const action of release) await attempt(action)
    const settledCreations = await Promise.allSettled(creations)
    for (const result of settledCreations)
      if (result.status === 'rejected') errors.push(result.reason)
    // Iteration also retains writes registered while an earlier owned operation settles.
    for (const write of writes) await attempt(() => write)
    // graceful close drains active processors before the owned queue can be deleted.
    const closedWorkers = await Promise.allSettled(workers.map(async worker => worker.close(false)))
    writersDrained =
      settledCreations.every(result => result.status === 'fulfilled') &&
      closedWorkers.every(result => result.status === 'fulfilled')
    for (const result of closedWorkers) if (result.status === 'rejected') errors.push(result.reason)
    await attempt(() => events?.close())
    for (const wait of waits) wait.reject(new Error('Owned embedding queue closed'))
    waits.clear()
    if (writersDrained) await attempt(() => queue.obliterate({ force: true }))
    await attempt(() => queue.close())
    // Diagnostics cannot precede or skip any mandatory resource cleanup step.
    await drainDiagnostics()
    // An SDK error can arrive after the last wait resolves, including during close.
    if (hasEventError) errors.push(eventError)
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
