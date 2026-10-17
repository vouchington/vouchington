import type { CrawlEmbedsJobs } from '@queues/crawl-embeds/types'
import { backfillPendingCrawlEmbeds, resolveCrawlOEmbed } from '@services/crawl-embeds'
import type { Job } from 'glide-mq'

export async function processCrawlEmbedsJob(job: Job): Promise<void> {
  switch (job.name as CrawlEmbedsJobs) {
    case 'backfill_crawl_embeds':
      await backfillPendingCrawlEmbeds()
      return
    case 'resolve_crawl_oembed': {
      const crawlId = job.data?.crawl_id
      if (!crawlId) throw new Error('Resolve crawl oEmbed job .crawl_id is required')
      await resolveCrawlOEmbed(crawlId)
      return
    }
    default:
      throw new Error(`Crawl embeds job ${job.name} not found`)
  }
}
