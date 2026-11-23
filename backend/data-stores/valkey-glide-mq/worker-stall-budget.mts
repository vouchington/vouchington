import type { Processor } from 'glide-mq'
import { withStallBudget } from '@vouchington/worker-runtime/glide-mq'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'

export const PAGED_DISPATCHER_MAX_STALLED_COUNT = 1_000_000

/** A shared worker's high native limit must not grant ordinary handlers extra side-effect runs. */
export function withPagedDispatcherStallBudget<D, R>(
  queueName: string,
  processor: Processor<D, R>,
  prefix = workerQueuePrefix,
): Processor<D, R> {
  return withStallBudget(queueName, processor, {
    hget: (key, field) => workerQueueCommandClient.hget(key, field),
    prefix,
    exempt: job => job.opts.backoff?.type.startsWith('paged-dispatch-') === true,
  })
}
