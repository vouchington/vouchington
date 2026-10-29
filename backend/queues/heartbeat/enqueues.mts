import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import {
  GLIDE_MQ_STATS_JOB_NAME,
  GLIDE_MQ_STATS_JOB_OPTIONS,
  HEARTBEAT_JOB_NAME,
  QUEUE_NAME,
} from './config.mts'
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

const enqueueHeartbeatJob = createEnqueueFunction<HeartbeatData, typeof HEARTBEAT_JOB_NAME>({
  queue: heartbeat,
  queueName: QUEUE_NAME,
  jobName: HEARTBEAT_JOB_NAME,
  defaults: { attempts: 1, removeOnComplete: 100, removeOnFail: 100, priority: 10 },
})

/** Enqueue one liveness job; a running worker logs its completion under NODE_ENV=test. */
export function enqueueHeartbeat(): ReturnType<typeof enqueueHeartbeatJob> {
  return enqueueHeartbeatJob({ enqueuedAt: Date.now() })
}
