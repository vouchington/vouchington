import { Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { KAGI_SMALLWEB_ORDERING, QUEUE_NAME } from '@queues/kagi-smallweb/config'
import { dispatchKagiSmallWeb } from '@services/kagi-smallweb'
import { processFeedEntry } from '@services/kagi-smallweb/process-feed-entry'
import type { KagiFeedJobData } from '@queues/kagi-smallweb/types'

export async function kagiSmallWebProcessor(job: Job): Promise<unknown> {
  switch (job.opts.ordering?.key) {
    case KAGI_SMALLWEB_ORDERING.dispatcher.key:
      switch (job.name) {
        case 'sync':
          return dispatchKagiSmallWeb()
        default:
          throw new Error(`Unknown kagi-smallweb dispatcher job: ${job.name}`)
      }
    case KAGI_SMALLWEB_ORDERING.process.key:
      switch (job.name) {
        case 'processFeed':
          return processFeedEntry(job.data as KagiFeedJobData)
        default:
          throw new Error(`Unknown kagi-smallweb process job: ${job.name}`)
      }
    default:
      throw new Error(`Unknown kagi-smallweb ordering key: ${job.opts.ordering?.key}`)
  }
}

export const kagiSmallWeb = new Worker(QUEUE_NAME, kagiSmallWebProcessor, {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('kagiSmallWeb', { baseline: 5 }),
})
