import type { CrawlEmbedsJobs } from '@queues/crawl-embeds/types'
import { unrecoverable } from '@modules/queue-errors'
import { backfillPendingCrawlEmbeds, resolveCrawlOEmbed } from '@services/crawl-embeds'
import { EmbedPolicyError } from '@vouchington/embeds'
import type { Job } from 'glide-mq'

export async function processCrawlEmbedsJob(job: Job): Promise<void> {
  switch (job.name as CrawlEmbedsJobs) {
    case 'backfill_crawl_embeds':
      await backfillPendingCrawlEmbeds()
      return
    case 'resolve_crawl_oembed': {
      const crawlId = job.data?.crawl_id
      if (!crawlId) throw new Error('Resolve crawl oEmbed job .crawl_id is required')
      try {
        await resolveCrawlOEmbed(crawlId)
      } catch (err) {
        // A policy denial depends only on the persisted URLs, so every retry would be denied again.
        if (err instanceof EmbedPolicyError) unrecoverable(err)
        throw err
      }
      return
    }
    default:
      throw new Error(`Crawl embeds job ${job.name} not found`)
  }
}
