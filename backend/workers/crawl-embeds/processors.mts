import type { CrawlEmbedsJobPayloads } from '@queues/crawl-embeds/types'
import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import { backfillPendingCrawlEmbeds, resolveCrawlOEmbed } from '@services/crawl-embeds'

type CrawlEmbedsJob = NamedQueueJob<CrawlEmbedsJobPayloads>

export async function processCrawlEmbedsJob(job: CrawlEmbedsJob): Promise<void> {
  const jobName: string = job.name
  switch (job.name) {
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
      throw new Error(`Crawl embeds job ${jobName} not found`)
  }
}
