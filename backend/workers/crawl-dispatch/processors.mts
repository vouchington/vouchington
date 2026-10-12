import type { Job } from 'glide-mq'
import { enqueueBulkBoilerplateRemoval } from '@queues/crawl-dispatch/enqueues/boilerplate'
import { processCrawlHostnamesJob } from './processors/hostnames.mts'
import {
  processBoilerplateRemoval,
  processBoilerplateRemovalDispatcher,
} from './processors/boilerplate.mts'

export async function processCrawlDispatchJob(job: Job): Promise<unknown> {
  switch (job.name) {
    case 'enqueueCrawlHostnamesDispatcher':
    case 'enqueueCrawlTier1Dispatcher':
    case 'enqueueCrawlTier2Dispatcher':
    case 'crawl_hostnames_dispatcher':
    case 'crawl_urls_per_hostname_dispatcher':
    case 'crawl_tier1_dispatcher':
    case 'crawl_tier2_dispatcher':
    case 'refresh_hostname_crawler_dispatcher':
    case 'refresh_hostname_crawler':
    case 'crawl_cleanup':
      return processCrawlHostnamesJob(job)
    case 'boilerplate_removal_dispatcher': {
      const candidates = await processBoilerplateRemovalDispatcher()
      await enqueueBulkBoilerplateRemoval(
        candidates.map(candidate => ({
          hostnameId: candidate.hostname_id,
          parentPath: candidate.parent_path,
        })),
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
      throw new Error(`Crawl dispatch job ${job.name} not found`)
  }
}
