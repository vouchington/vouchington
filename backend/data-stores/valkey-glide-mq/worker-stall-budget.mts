import { UnrecoverableError, type Processor } from 'glide-mq'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'

/** Two cumulative stalls survive a rolling deploy plus a delayed heartbeat without hiding loops. */
export const DEFAULT_MAX_STALLED_COUNT = 2
export const PAGED_DISPATCHER_MAX_STALLED_COUNT = 1_000_000

/** A shared worker's high native limit must not grant ordinary handlers extra side-effect runs. */
export function withPagedDispatcherStallBudget<D, R>(
  queueName: string,
  processor: Processor<D, R>,
  prefix = workerQueuePrefix,
): Processor<D, R> {
  return async job => {
    if (!job.opts.backoff?.type.startsWith('paged-dispatch-')) {
      const stalls = await workerQueueCommandClient.hget(
        `${prefix ?? 'glide'}:{${queueName}}:job:${job.id}`,
        'stalledCount',
      )
      if (Number(stalls) > DEFAULT_MAX_STALLED_COUNT)
        throw new UnrecoverableError('Ordinary job exceeded its stalled recovery budget')
    }
    return processor(job)
  }
}
