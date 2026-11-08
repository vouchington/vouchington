import { processRetainedSweep, type NamedQueueJob } from '@data-stores/valkey-glide-mq'
import { dispatchReferralLinkCrawls } from '@services/crawler-referral-links'
import { getCrawlerForReferralProgram } from '@services/crawlers'
import { crawlUrl } from '@services/crawls/crawl-url'
import { getUrlById } from '@services/urls/get'
import type { Job } from 'glide-mq'
import type { BackgroundCpuJobPayloads } from '../../queues/background-cpu/types.mts'
import { enqueueCrawlBrowser } from '@queues/crawl-browser/enqueues'
import {
  handleCrawlReferralLinkError,
  handleCrawlReferralLinkResult,
} from './processors/outcomes.mts'

type ReferralJob = NamedQueueJob<
  Pick<
    BackgroundCpuJobPayloads,
    'crawl.crawl_referral_link' | 'crawl.crawl_referral_links_dispatcher'
  >
>

export async function processCrawlReferralLinksJob(rawJob: Job<unknown>): Promise<unknown> {
  const job = rawJob as ReferralJob
  const jobName = rawJob.name
  if (job.name === 'crawl.crawl_referral_links_dispatcher')
    return processRetainedSweep(job, save =>
      dispatchReferralLinkCrawls({ ...job.data, saveProgress: save }),
    )
  switch (job.name) {
    case 'crawl.crawl_referral_link': {
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
        return undefined
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
      return undefined
    }
    default:
      throw new Error(`Crawl referral link job ${jobName} not found`)
  }
}
