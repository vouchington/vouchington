import { closeAndUnregisterGlideMQInstance, createQueue } from '@data-stores/valkey-glide-mq'
import { removeScheduledJobScheduler } from '@modules/scheduled-job-manifest'

const QUEUE_NAME = 'wikipedia-recommender'
const SCHEDULER_ID = 'wikipedia-recommender-dispatch'
const queue = createQueue(QUEUE_NAME)

try {
  const result = await removeScheduledJobScheduler(queue, SCHEDULER_ID)
  console.info(
    JSON.stringify({
      operation: 'remove-retired-scheduler',
      queue: QUEUE_NAME,
      scheduler_id: SCHEDULER_ID,
      ...result,
    }),
  )
} finally {
  await closeAndUnregisterGlideMQInstance(queue)
}
