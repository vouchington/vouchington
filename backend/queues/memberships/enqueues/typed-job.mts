import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { QUEUE_NAME } from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobPayloads } from '../types.mts'

/** Resolves the enqueue payload from the actual job name. */
export function createMembershipEnqueueFunction<TName extends keyof MembershipsJobPayloads>(
  jobName: TName,
  defaults?: Partial<JobOptions>,
) {
  return createEnqueueFunction<MembershipsJobPayloads[TName], TName>({
    queue: memberships,
    queueName: QUEUE_NAME,
    jobName,
    ...(defaults ? { defaults } : {}),
  })
}
