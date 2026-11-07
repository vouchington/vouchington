import type { Job } from 'glide-mq'
import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import type { BackgroundCpuJobPayloads } from '@queues/background-cpu/types'
import { enqueueBulkBoilerplateRemoval } from '@queues/crawl-dispatch/enqueues/boilerplate'
import { processCrawlHostnamesJob } from './processors/hostnames.mts'
import {
  processBoilerplateRemoval,
  processBoilerplateRemovalDispatcher,
} from './processors/boilerplate.mts'

type CrawlDispatchJob = NamedQueueJob<
  Pick<
    BackgroundCpuJobPayloads,
    | 'crawl.crawl_hostnames_dispatcher'
    | 'crawl.crawl_urls_per_hostname_dispatcher'
    | 'crawl.crawl_tier1_dispatcher'
    | 'crawl.crawl_tier2_dispatcher'
    | 'crawl.refresh_hostname_crawler_dispatcher'
    | 'crawl.refresh_hostname_crawler'
    | 'crawl.crawl_cleanup'
    | 'crawl.boilerplate_removal_dispatcher'
    | 'crawl.boilerplate_removal'
  >
>

export async function processCrawlDispatchJob(rawJob: Job<unknown>): Promise<unknown> {
  const job = rawJob as CrawlDispatchJob
  const jobName = rawJob.name
  switch (job.name) {
    case 'crawl.crawl_hostnames_dispatcher':
    case 'crawl.crawl_urls_per_hostname_dispatcher':
    case 'crawl.crawl_tier1_dispatcher':
    case 'crawl.crawl_tier2_dispatcher':
    case 'crawl.refresh_hostname_crawler_dispatcher':
    case 'crawl.refresh_hostname_crawler':
    case 'crawl.crawl_cleanup':
      return processCrawlHostnamesJob(job)
    case 'crawl.boilerplate_removal_dispatcher': {
      const candidates = await processBoilerplateRemovalDispatcher()
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
      throw new Error(`Crawl dispatch job ${jobName} not found`)
  }
}
