import { pagedDispatchBackoffStrategies } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import {
  PAGED_DISPATCHER_MAX_STALLED_COUNT,
  withPagedDispatcherStallBudget,
} from '@data-stores/valkey-glide-mq/worker-stall-budget'
import { createWorker } from '@data-stores/valkey-glide-mq'
import onError from '@modules/on-error'
import { getWorkerConcurrency } from '@modules/queue-config'
import { BACKGROUND_CPU_QUEUE_NAME, type BackgroundCpuDomain } from '@queues/background-cpu/config'
import { getBackgroundCpuWorkerBaseline } from '@queues/background-cpu/enqueues/registry'
import type { BackgroundCpuHandler } from '@queues/background-cpu/types'
import { watchQueueDomainControls } from '@services/queue-domain-controls'
import { buildCpuHandlerMap } from '../processors/handler-map.mts'
import { createBackgroundCpuProcessor } from '../processors.mts'

export type BackgroundCpuWorkerOptions = {
  /** Every domain's handlers; the runtime definition passes `BACKGROUND_CPU_HANDLERS`. */
  handlers: readonly BackgroundCpuHandler[]
  /** Serve only these domains; a job of another domain parks. Tests use it; production serves all. */
  domains?: readonly BackgroundCpuDomain[]
  /** An isolated key prefix, for tests that must not touch the shared queue. */
  prefix?: string
  concurrency?: number
  /** Override the blocking read timeout for isolated worker lifecycle tests. */
  blockTimeout?: number
  /** Override the scheduler promotion cadence for isolated worker lifecycle tests. */
  promotionInterval?: number
}

/**
 * One worker for every domain in the `background-cpu` queue. Its concurrency is the combined baseline of
 * the domains it replaced, and it follows pause changes published for those domains.
 */
export function createBackgroundCpuWorker(options: BackgroundCpuWorkerOptions) {
  const baseline = getBackgroundCpuWorkerBaseline()
  const processor = createBackgroundCpuProcessor(
    buildCpuHandlerMap(options.handlers, options.domains),
  )
  const worker = createWorker(
    BACKGROUND_CPU_QUEUE_NAME,
    withPagedDispatcherStallBudget(BACKGROUND_CPU_QUEUE_NAME, processor, options.prefix),
    {
      dedicatedCommandClient: true,
      backoffStrategies: pagedDispatchBackoffStrategies(),
      maxStalledCount: PAGED_DISPATCHER_MAX_STALLED_COUNT,
      ...(options.prefix ? { prefix: options.prefix } : {}),
      ...(options.blockTimeout === undefined ? {} : { blockTimeout: options.blockTimeout }),
      ...(options.promotionInterval === undefined
        ? {}
        : { promotionInterval: options.promotionInterval }),
      concurrency:
        options.concurrency ??
        getWorkerConcurrency('background-cpu', { baseline, max: baseline * 4 }),
    },
  )
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
