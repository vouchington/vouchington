import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { Queue, QueueEvents, type Worker, type Job, type QueueEventsOptions } from 'glide-mq'
import type { acquireEmbeddingQuotaFixture } from './embedding-creation-quota.mts'

type EventName = 'delay-changed' | 'completed' | 'failed'
type Fixture = Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>

/** Observes committed stream transitions on an owned real queue, not worker emptiness. */
export function createOwnedEmbeddingQueue(
  fixture: Fixture,
  label: string,
  options: Pick<QueueEventsOptions, 'connection' | 'prefix'>,
) {
  const name = `embedding_creation_${label}_${randomUUID()}`
  const queue = new Queue(name, options)
  const workers: Worker[] = []
  const writes: Promise<unknown>[] = []
  const release: Array<() => void> = []
  let events: QueueEvents | undefined
  let closing: Promise<void> | undefined
  let writersDrained = false
  const cleanup = () => (closing ??= close())
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
  const diagnosticReads: Promise<void>[] = []
  onTestFinished(({ task }) => {
    if (task.result?.state !== 'fail') return
    const diagnostic = {
      queue: name,
      prefix: options.prefix,
      closing: closing !== undefined,
      writersDrained,
      pending: [...waits].map(({ id, event, occurrence }) => ({ id, event, occurrence })),
      history: [...history].map(([id, counts]) => ({ id, events: Object.fromEntries(counts) })),
      jobs: [] as Array<{ id: string; state?: string; readError?: string }>,
    }
    Object.assign(task.meta, { ownedEmbeddingQueue: diagnostic })
    for (const id of new Set([...history.keys(), ...[...waits].map(wait => wait.id)])) {
      // Queue command reads do not borrow the worker's blocking connection or PostgreSQL pool.
      diagnosticReads.push(
        queue
          .getJob(id)
          .then(job => job?.getState())
          .then(
            state => {
              return void diagnostic.jobs.push({ id, state })
            },
            err => {
              return void diagnostic.jobs.push({
                id,
                readError: err instanceof Error ? err.name : typeof err,
              })
            },
          ),
      )
    }
  })
  const onError = (error: unknown) => {
    eventError = error
    hasEventError = true
    for (const wait of waits) wait.reject(error)
    waits.clear()
  }
  queue.on('error', onError)
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
  return {
    queue,
    workers,
    watchWorker: (worker: Worker) => {
      workers.push(worker)
      worker.on('error', onError)
      return worker
    },
    options,
    cleanup,
    run: async <T,>(action: () => Promise<T>): Promise<T> => {
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
    ready: () => events!.waitUntilReady(),
    track,
    /** A zero-delay continuation may already be promoted; require its actual completion. */
    promoteContinuation: (job: Pick<Job, 'promote'>, completed: Promise<void>) =>
      track(
        job.promote().catch(async err => {
          if (!(err instanceof Error) || err.message !== 'Cannot promote: not_delayed') throw err
          await completed
        }),
      ),
    add: (...args: Parameters<Queue['add']>) => track(queue.add(...args)),
    releaseOnCleanup: (action: () => void) => release.push(action),
    waitFor: (id: string, event: EventName, occurrence = 1): Promise<void> => {
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
    const settledWrites = await Promise.allSettled(writes)
    for (const result of settledWrites) if (result.status === 'rejected') errors.push(result.reason)
    // graceful close drains active processors before the owned queue can be deleted.
    const closedWorkers = await Promise.allSettled(workers.map(async worker => worker.close(false)))
    writersDrained = closedWorkers.every(result => result.status === 'fulfilled')
    for (const result of closedWorkers) if (result.status === 'rejected') errors.push(result.reason)
    await attempt(() => events?.close())
    for (const wait of waits) wait.reject(new Error('Owned embedding queue closed'))
    waits.clear()
    if (writersDrained) await attempt(() => queue.obliterate({ force: true }))
    await attempt(() => queue.close())
    // Diagnostics cannot precede or skip any mandatory resource cleanup step.
    await Promise.allSettled(diagnosticReads)
    // An SDK error can arrive after the last wait resolves, including during close.
    if (hasEventError) errors.push(eventError)
    for (const worker of workers) worker.off('error', onError)
    if (errors.length)
      throw new AggregateError(
        errors,
        writersDrained
          ? 'Owned embedding queue cleanup failed'
          : 'Owned embedding worker drain failed; queue obliteration and config/accounting restoration withheld',
      )
  }
}
