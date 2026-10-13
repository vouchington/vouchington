import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/activitypub/config'
import { processActivityPubJob } from './processors.mts'

export {
  isFinalActivityPubInboxAttempt,
  processActivityPubInboxJob,
} from './processors/inbox-job.mts'
export type { ActivityPubInboxJobProcessors } from './processors/inbox-job.mts'

export const activitypubWorker = createWorker(QUEUE_NAME, processActivityPubJob, {
  concurrency: getWorkerConcurrency('activitypub', { baseline: 10 }),
})
