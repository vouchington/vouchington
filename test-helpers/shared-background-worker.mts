import type { BackgroundDomain } from '../backend/queues/background/config.mts'
import { BACKGROUND_HANDLERS } from '../backend/workers/background/processors/handlers.mts'
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
  domains: readonly BackgroundDomain[],
): SharedBackgroundWorker {
  if (!sharedWorker) {
    sharedWorker = createBackgroundWorker({ handlers: BACKGROUND_HANDLERS, domains })
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
