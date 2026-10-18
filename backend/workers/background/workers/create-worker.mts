import { pagedDispatchBackoffStrategies } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { createWorker } from '@data-stores/valkey-glide-mq'
import onError from '@modules/on-error'
import { getWorkerConcurrency } from '@modules/queue-config'
import { BACKGROUND_QUEUE_NAME, type BackgroundDomain } from '@queues/background/config'
import { getBackgroundWorkerBaseline } from '@queues/background/enqueues/registry'
import type { BackgroundHandler } from '@queues/background/types'
import { watchQueueDomainControls } from '@services/queue-domain-controls'
import { buildHandlerMap } from '../processors/handler-map.mts'
import { createBackgroundProcessor } from '../processors.mts'

export type BackgroundWorkerOptions = {
  /** Every domain's handlers; the runtime definition passes `BACKGROUND_HANDLERS`. */
  handlers: readonly BackgroundHandler[]
  /** Serve only these domains; a job of another domain parks. Tests use it; production serves all. */
  domains?: readonly BackgroundDomain[]
  /** An isolated key prefix, for tests that must not touch the shared queue. */
  prefix?: string
  concurrency?: number
}

/**
 * One worker for every domain in the `background` queue. Its concurrency is the combined baseline of
 * the domains it replaced, and it follows pause changes published for those domains.
 */
export function createBackgroundWorker(options: BackgroundWorkerOptions) {
  const baseline = getBackgroundWorkerBaseline()
  const processor = createBackgroundProcessor(buildHandlerMap(options.handlers, options.domains))
  const worker = createWorker(BACKGROUND_QUEUE_NAME, processor, {
    dedicatedCommandClient: true,
    backoffStrategies: pagedDispatchBackoffStrategies(),
    maxStalledCount: 1000000,
    ...(options.prefix ? { prefix: options.prefix } : {}),
    concurrency:
      options.concurrency ?? getWorkerConcurrency('background', { baseline, max: baseline * 4 }),
  })
  closePauseWatcherWithWorker(worker)
  return worker
}

// The pause cache expires on its own, so a failed subscription only lengthens the pause window.
function closePauseWatcherWithWorker(worker: { close(force?: boolean): Promise<void> }): void {
  const watcher = watchQueueDomainControls().catch((err: unknown) => {
    onError(err instanceof Error ? err : new Error('Pause watcher failed', { cause: err }))
    return null
  })
  const closeWorker = worker.close
  worker.close = async function closeWorkerAndWatcher(force?: boolean): Promise<void> {
    try {
      await closeWorker.call(worker, force)
    } finally {
      await (await watcher)?.close()
    }
  }
}
