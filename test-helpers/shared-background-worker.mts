import type { BackgroundDomain } from '../backend/queues/background/config.mts'
import { entityListenersHandlers } from '../backend/workers/entity-listeners/workers.mts'
import { voteAggregationHandlers } from '../backend/workers/vote-aggregation/workers.mts'
import { createBackgroundWorker } from '../backend/workers/background/workers/create-worker.mts'
import { DEFAULT_FLUSH_TIMEOUT_MS, type FlushQueue } from './glide-mq-vitest-flush-wait.mts'
import { settleRunnableQueueJobs } from './vitest-fork-leak-background-settle.mts'

type SharedBackgroundWorker = ReturnType<typeof createBackgroundWorker>

// The in-memory test worker's own state: its queue, the workers attached to that queue, and the
// gate `processAvailable` honours. They are internal to `glide-mq/testing`; this product-specific
// setup relies on the same worker state when coordinating the shared background queue.
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

/**
 * Wait for jobs the shared background worker can still run, so a later socket snapshot does not
 * count connections those jobs have checked out. Returns false when this fork never started the
 * worker. A worker paused because another file attached its own worker is not going to pick up
 * waiting jobs; only jobs already active can still hold a connection, and parked jobs never can.
 */
export async function settleSharedBackgroundJobs(
  flushTimeoutMs = DEFAULT_FLUSH_TIMEOUT_MS,
): Promise<boolean> {
  if (!sharedWorker) return false
  const internals = sharedWorker as unknown as { paused?: boolean; queue: FlushQueue }
  if ((await internals.queue.getWorkers()).length === 0) return false
  await settleRunnableQueueJobs(internals.queue, {
    includeWaiting: internals.paused !== true,
    flushTimeoutMs,
  })
  return true
}

type JobProcessor = (job: { name: string }) => Promise<unknown>

const domainGates = new Map<string, Promise<void>>()
// Handlers of a held domain, from the hold until its release has drained them. A held job its test
// already removed still runs its handler on release, and that handler may enqueue same-domain
// children; all of that DB work must settle before the holding test ends.
const trackedRuns = new Map<string, Set<Promise<unknown>>>()
let gatingInstalled = false

function domainOf(job: { name: string }): string {
  return job.name.slice(0, job.name.indexOf('.'))
}

/**
 * Hold one domain's jobs: they still become active on the shared worker, but their handler does not
 * start until the returned release runs. Pausing the worker instead would stall every other
 * domain's job too, including jobs a producer awaits before it reaches the held domain's job.
 *
 * The returned release resolves once the domain's handlers, including ones the released handlers
 * spawned, have settled; await it, or they keep querying (and opening pool sockets) after the
 * holding test ends.
 */
export function holdBackgroundDomain(domain: BackgroundDomain): () => Promise<void> {
  const worker = getSharedBackgroundWorker()
  if (!gatingInstalled) {
    const internals = worker as unknown as { processor: JobProcessor }
    const processor = internals.processor
    internals.processor = job => {
      const name = domainOf(job)
      const runs = trackedRuns.get(name)
      const gate = domainGates.get(name)
      if (!runs) return gate ? gate.then(() => processor(job)) : processor(job)
      const run = (gate ? gate.then(() => processor(job)) : processor(job)).finally(() =>
        runs.delete(run),
      )
      runs.add(run)
      return run
    }
    gatingInstalled = true
  }
  const gate = Promise.withResolvers<void>()
  domainGates.set(domain, gate.promise)
  const runs = trackedRuns.get(domain) ?? new Set<Promise<unknown>>()
  trackedRuns.set(domain, runs)
  return async () => {
    if (domainGates.get(domain) === gate.promise) domainGates.delete(domain)
    gate.resolve()
    while (runs.size > 0) await Promise.allSettled([...runs])
    if (!domainGates.has(domain)) trackedRuns.delete(domain)
  }
}
