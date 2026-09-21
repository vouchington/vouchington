import { removeQueueScheduler } from '@services/queue-monitoring'

const QUEUE_NAME = 'wikipedia-recommender'
const SCHEDULER_ID = 'wikipedia-recommender-dispatch'
const result = await removeQueueScheduler(QUEUE_NAME, SCHEDULER_ID)
console.info(
  JSON.stringify({
    operation: 'remove-retired-scheduler',
    queue: QUEUE_NAME,
    scheduler_id: SCHEDULER_ID,
    ...result,
  }),
)
