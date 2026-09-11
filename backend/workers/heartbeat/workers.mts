import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { GLIDE_MQ_STATS_JOB_NAME, QUEUE_NAME } from '@queues/heartbeat/config'
import type { HeartbeatData, HeartbeatResult } from '@queues/heartbeat/types'
import type { Job } from 'glide-mq'
import { processHeartbeat } from './processors.mts'
import { publishAggregatedQueueStats } from '@services/queue-monitoring/publish-cloudwatch'

export const heartbeat = createWorker<HeartbeatData, HeartbeatResult>(
  QUEUE_NAME,
  async (job: Job<HeartbeatData>) => {
    if (job.name === GLIDE_MQ_STATS_JOB_NAME) await publishAggregatedQueueStats()
    return processHeartbeat(job.data)
  },
  { concurrency: getWorkerConcurrency('heartbeat', { baseline: 1, ignoreScale: true }) },
)
