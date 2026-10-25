import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { GLIDE_MQ_STATS_JOB_NAME, GLIDE_MQ_STATS_JOB_OPTIONS, QUEUE_NAME } from './config.mts'
import { heartbeat } from './queues.mts'
import type { HeartbeatData } from './types.mts'

const enqueueGlideMqStatsJob = createEnqueueFunction<HeartbeatData, typeof GLIDE_MQ_STATS_JOB_NAME>(
  {
    queue: heartbeat,
    queueName: QUEUE_NAME,
    jobName: GLIDE_MQ_STATS_JOB_NAME,
    defaults: GLIDE_MQ_STATS_JOB_OPTIONS,
  },
)

/** Enqueue one class-aggregated GlideMQ metrics publication. */
export function enqueueGlideMqStats(): ReturnType<typeof enqueueGlideMqStatsJob> {
  return enqueueGlideMqStatsJob({})
}
