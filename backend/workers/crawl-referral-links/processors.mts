import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { enqueueCrawlReferralLinksDispatcher } from '@queues/crawl-referral-links/enqueues'
import type { CrawlReferralLinksJobs } from '@queues/crawl-referral-links/types'
import { dispatchReferralLinkCrawls } from '@services/crawler-referral-links'
import { getCrawlerForReferralProgram } from '@services/crawlers'
import { crawlUrl } from '@services/crawls/crawl-url'
import { getUrlById } from '@services/urls/get'
import type { Job } from 'glide-mq'
import { enqueueCrawlBrowser } from '@queues/crawl-browser/enqueues'
import {
  handleCrawlReferralLinkError,
  handleCrawlReferralLinkResult,
} from './processors/outcomes.mts'

export async function processCrawlReferralLinksJob(job: Job): Promise<unknown> {
  if (job.name === 'enqueueCrawlReferralLinksDispatcher')
    return enqueueCrawlReferralLinksDispatcher()
  if (job.name === 'crawl_referral_links_dispatcher')
    return processRetainedSweep(job, save =>
      dispatchReferralLinkCrawls({ ...job.data, saveProgress: save }),
    )
  switch (job.name as CrawlReferralLinksJobs) {
    case 'crawl_referral_link': {
      const { linkId, urlId, referralProgramId } = job.data ?? {}
      if (!linkId) throw new Error('Crawl referral link job .linkId is required')
      if (!urlId) throw new Error('Crawl referral link job .urlId is required')
      if (!referralProgramId)
        throw new Error('Crawl referral link job .referralProgramId is required')

      const url = await getUrlById(urlId)
      if (!url) throw new Error(`URL not found: ${urlId}`)

      const crawler = await getCrawlerForReferralProgram(url.hostname.id, referralProgramId)

      if (crawler.crawler_type === 'automation') {
        await enqueueCrawlBrowser({ linkId, urlId: url.id, crawlerId: crawler.id })
        return
      }

      // Fetch path
      try {
        const crawlResult = await crawlUrl(urlId, 0, new Set(), {
          skipChunks: true,
          skipEmbedResolution: true,
        })
        if (crawlResult !== null)
          await handleCrawlReferralLinkResult(linkId, url.id, crawler.id, crawlResult)
      } catch (err) {
        await handleCrawlReferralLinkError(linkId, err)
      }
      return
    }
    default:
      throw new Error(`Crawl referral link job ${job.name} not found`)
  }
}
