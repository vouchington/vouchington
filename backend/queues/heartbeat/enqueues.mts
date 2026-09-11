import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import {
  GLIDE_MQ_STATS_JOB_NAME,
  GLIDE_MQ_STATS_JOB_OPTIONS,
  HEARTBEAT_JOB_NAME,
  HEARTBEAT_JOB_OPTIONS,
  QUEUE_NAME,
} from './config.mts'
import { heartbeat } from './queues.mts'
import type { HeartbeatData, HeartbeatJobName } from './types.mts'

const enqueueHeartbeatJob = createEnqueueFunction<HeartbeatData, HeartbeatJobName>({
  queue: heartbeat,
  queueName: QUEUE_NAME,
  jobName: HEARTBEAT_JOB_NAME,
  defaults: HEARTBEAT_JOB_OPTIONS,
})

const enqueueGlideMqStatsJob = createEnqueueFunction<HeartbeatData, HeartbeatJobName>({
  queue: heartbeat,
  queueName: QUEUE_NAME,
  jobName: GLIDE_MQ_STATS_JOB_NAME,
  defaults: GLIDE_MQ_STATS_JOB_OPTIONS,
})

/** @public — used from CI smoke tests and Playwright global setup */
export function enqueueHeartbeat(data: HeartbeatData = {}): ReturnType<typeof enqueueHeartbeatJob> {
  return enqueueHeartbeatJob({ ...data, enqueuedAt: data.enqueuedAt ?? Date.now() })
}

/** Enqueue one class-aggregated GlideMQ metrics publication. */
export function enqueueGlideMqStats(): ReturnType<typeof enqueueGlideMqStatsJob> {
  return enqueueGlideMqStatsJob({})
}
