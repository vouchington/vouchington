import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/activitypub-inbox/config'
import { processActivityPubInboxJob } from './workers/process-job.mts'

export {
  isFinalActivityPubInboxAttempt,
  processActivityPubInboxJob,
} from './workers/process-job.mts'
export type { ActivityPubInboxJobProcessors } from './workers/process-job.mts'

export const activitypubInboxWorker = createWorker(QUEUE_NAME, processActivityPubInboxJob, {
  concurrency: getWorkerConcurrency('activitypubInbox', { baseline: 5 }),
})
