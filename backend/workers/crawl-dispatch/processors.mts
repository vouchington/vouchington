import type { Job } from 'glide-mq'
import { enqueueBulkBoilerplateRemoval } from '@queues/crawl-dispatch/enqueues/boilerplate'
import { processCrawlHostnamesJob } from './processors/hostnames.mts'
import {
  processBoilerplateRemoval,
  processBoilerplateRemovalDispatcher,
} from './processors/boilerplate.mts'

type ProcessorDependencies = {
  processCrawlHostnamesJob?: typeof processCrawlHostnamesJob
  processBoilerplateRemovalDispatcher?: typeof processBoilerplateRemovalDispatcher
}

export async function processCrawlDispatchJob(
  job: Job,
  dependencies: ProcessorDependencies = {},
): Promise<unknown> {
  switch (job.name) {
    case 'crawl.crawl_hostnames_dispatcher':
    case 'crawl.crawl_urls_per_hostname_dispatcher':
    case 'crawl.crawl_tier1_dispatcher':
    case 'crawl.crawl_tier2_dispatcher':
    case 'crawl.refresh_hostname_crawler_dispatcher':
    case 'crawl.refresh_hostname_crawler':
    case 'crawl.crawl_cleanup':
      return (dependencies.processCrawlHostnamesJob ?? processCrawlHostnamesJob)(job)
    case 'crawl.boilerplate_removal_dispatcher': {
      const candidates = await (
        dependencies.processBoilerplateRemovalDispatcher ?? processBoilerplateRemovalDispatcher
      )()
      await enqueueBulkBoilerplateRemoval(
        candidates.map(candidate => ({
          hostnameId: candidate.hostname_id,
          parentPath: candidate.parent_path,
        })),
      )
      return candidates.length
    }
    case 'crawl.boilerplate_removal': {
      const hostnameId = job.data?.hostname_id
      const parentPath = job.data?.parent_path
      if (!hostnameId || !parentPath)
        throw new Error('Boilerplate removal job requires .hostname_id and .parent_path')
      return processBoilerplateRemoval(hostnameId, parentPath)
    }
    default:
      throw new Error(`Crawl dispatch job ${job.name} not found`)
  }
}
