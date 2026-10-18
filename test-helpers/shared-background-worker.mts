import type { BackgroundDomain } from '../backend/queues/background/config.mts'
import { entityListenersHandlers } from '../backend/workers/entity-listeners/workers.mts'
import { voteAggregationHandlers } from '../backend/workers/vote-aggregation/workers.mts'
import { createBackgroundWorker } from '../backend/workers/background/workers/create-worker.mts'

type SharedBackgroundWorker = ReturnType<typeof createBackgroundWorker>

// The in-memory test worker's own state: its queue, the workers attached to that queue, and the
// gate `processAvailable` honours. They are internal to `glide-mq/testing`, which this shim layer
// already reaches into (see `glide-mq-vitest-internals.mts`).
type TestWorkerInternals = {
  paused: boolean
  wake(): void
  queue: { workers: Set<unknown> }
}

let sharedWorker: SharedBackgroundWorker | undefined

/**
 * A worker of the shared `background` queue serves only its own domains and parks every other
 * registered job for a day. The fork's shared worker must not do that to a job another worker in the
 * file serves, because whichever worker takes the job first decides. So it takes jobs only while
 * no other worker is attached to the queue: a file that builds its own `createBackgroundWorker`
 * (for its domain, often with stub handlers) owns the queue until it closes that worker, and the
 * shared worker resumes on its close, which wakes every peer.
 */
function yieldToOtherBackgroundWorkers(worker: SharedBackgroundWorker): void {
  const internals = worker as unknown as TestWorkerInternals
  const { workers } = internals.queue
  const { wake } = internals
  internals.wake = () => {
    internals.paused = [...workers].some(other => other !== worker)
    Reflect.apply(wake, internals, [])
  }
}

/**
 * The one live `background` worker of a backend test fork, serving only `domains`: a job of any
 * other domain parks (24 hours, `delayed`) instead of running. `vitest.setup.glide-mq-workers.mts`
 * starts it, and helpers that watch its `completed`/`failed` events import this same module, so
 * every importer observes one worker. Later calls return the first worker whatever they pass.
 */
export function startSharedBackgroundWorker(
  domains: readonly Extract<BackgroundDomain, 'vote-aggregation' | 'entity-listeners'>[],
): SharedBackgroundWorker {
  if (!sharedWorker) {
    sharedWorker = createBackgroundWorker({
      handlers: [...voteAggregationHandlers, ...entityListenersHandlers],
      domains,
    })
    yieldToOtherBackgroundWorkers(sharedWorker)
  }
  return sharedWorker
}

/** The shared worker, for tests that observe its events; the fork setup must have started it. */
export function getSharedBackgroundWorker(): SharedBackgroundWorker {
  if (!sharedWorker) {
    throw new Error('The shared background worker is not running: load the glide-mq workers setup')
  }
  return sharedWorker
}

type JobProcessor = (job: { name: string }) => Promise<unknown>

const domainGates = new Map<string, Promise<void>>()
// Handlers a gate delayed, until they settle. A held job its test already removed still runs its
// handler on release, and that DB work must not outlive the test that held it.
const gatedRuns = new Map<string, Set<Promise<unknown>>>()
let gatingInstalled = false

/**
 * Hold one domain's jobs: they still become active on the shared worker, but their handler does not
 * start until the returned release runs. Pausing the worker instead would stall every other
 * domain's job too, including jobs a producer awaits before it reaches the held domain's job.
 *
 * The returned release resolves once every handler the gate delayed has settled; await it, or those
 * handlers keep querying (and opening pool sockets) after the holding test ends.
 */
export function holdBackgroundDomain(domain: BackgroundDomain): () => Promise<void> {
  const worker = getSharedBackgroundWorker()
  if (!gatingInstalled) {
    const internals = worker as unknown as { processor: JobProcessor }
    const processor = internals.processor
    internals.processor = job => {
      const gate = domainGates.get(job.name.slice(0, job.name.indexOf('.')))
      if (!gate) return processor(job)
      const domainName = job.name.slice(0, job.name.indexOf('.'))
      const runs = gatedRuns.get(domainName) ?? new Set()
      gatedRuns.set(domainName, runs)
      const run = (async () => {
        try {
          await gate
          return await processor(job)
        } finally {
          runs.delete(run)
        }
      })()
      runs.add(run)
      return run
    }
    gatingInstalled = true
  }
  const gate = Promise.withResolvers<void>()
  domainGates.set(domain, gate.promise)
  return async () => {
    if (domainGates.get(domain) === gate.promise) domainGates.delete(domain)
    gate.resolve()
    await Promise.allSettled([...(gatedRuns.get(domain) ?? [])])
  }
}
