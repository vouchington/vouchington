import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from '../config.mts'
import { rssFeedMaintenance } from '../queues.mts'
import type { RssFeedMaintenanceJobPayloads } from '../types.mts'

export function createRssFeedMaintenanceEnqueue<TName extends keyof RssFeedMaintenanceJobPayloads>(
  jobName: TName,
) {
  return createEnqueueFunction<RssFeedMaintenanceJobPayloads[TName], TName>({
    queue: rssFeedMaintenance,
    queueName: QUEUE_NAME,
    jobName,
  })
}
