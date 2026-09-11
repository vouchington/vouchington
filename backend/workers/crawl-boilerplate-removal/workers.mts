import type { BoilerplateRemovalJobs } from '@queues/crawl-boilerplate-removal/types'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { BOILERPLATE_REMOVAL_QUEUE_NAME } from '@queues/crawl-boilerplate-removal/config'
import { processBoilerplateRemovalDispatcher, processBoilerplateRemoval } from './processors.mts'
import { enqueueBulkBoilerplateRemoval } from '@queues/crawl-boilerplate-removal/enqueues'
import { Worker, type Job } from 'glide-mq'

export const boilerplateRemoval = new Worker(
  BOILERPLATE_REMOVAL_QUEUE_NAME,
  async (job: Job) => {
    switch (job.name as BoilerplateRemovalJobs) {
      case 'boilerplate_removal_dispatcher': {
        const candidates = await processBoilerplateRemovalDispatcher()
        await enqueueBulkBoilerplateRemoval(
          candidates.map(c => ({ hostnameId: c.hostname_id, parentPath: c.parent_path })),
        )
        return candidates.length
      }
      case 'boilerplate_removal': {
        const hostnameId = job.data?.hostname_id
        const parentPath = job.data?.parent_path
        if (!hostnameId || !parentPath)
          throw new Error('Boilerplate removal job requires .hostname_id and .parent_path')
        return processBoilerplateRemoval(hostnameId, parentPath)
      }
      default:
        throw new Error(`Boilerplate removal job ${job.name} not found`)
    }
  },
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('crawlBoilerplateRemoval', { baseline: 5 }),
  },
)
