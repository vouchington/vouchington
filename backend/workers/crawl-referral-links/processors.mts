import type { CrawlReferralLinksJobs } from '@queues/crawl-referral-links/types'
import {
  dispatchReferralLinkCrawls,
  updateReferralLinkAfterCrawl,
} from '@services/crawler-referral-links'
import { getCrawlerForReferralProgram } from '@services/crawlers'
import { crawlUrl } from '@services/crawls/crawl-url'
import { isCsrEmptyShell } from '@services/crawls/csr-detection'
import type { CrawlBasic } from '@services/crawls/types'
import { getUrlById } from '@services/urls/get'
import {
  CrawlerHttpClientError,
  CrawlerRateLimitError,
  CrawlerServerError,
  CrawlerTimeoutError,
  CrawlerNetworkError,
  CrawlerResponseSizeExceededError,
  CrawlerSsrfError,
  HttpNoBodyError,
  CrawlerInvalidContentTypeError,
} from '@modules/on-error/errors'
import { type Job } from 'glide-mq'
import onError from '@modules/on-error'
import { enqueueCrawlBrowser } from '@queues/crawl-browser/enqueues'

export async function processCrawlReferralLinksJob(job: Job): Promise<unknown> {
  const orderingKey = job.opts.ordering?.key

  switch (orderingKey) {
    case 'dispatcher': {
      switch (job.name as CrawlReferralLinksJobs) {
        case 'crawl_referral_links_dispatcher':
          return dispatchReferralLinkCrawls()
        default:
          throw new Error(`Crawl referral links dispatcher job ${job.name} not found`)
      }
    }
    default: {
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
          } catch (error) {
            await handleCrawlReferralLinkError(linkId, error)
          }
          return
        }
        default:
          throw new Error(`Crawl referral link job ${job.name} not found`)
      }
    }
  }
}

export async function handleCrawlReferralLinkError(linkId: string, error: unknown): Promise<void> {
  if (error instanceof CrawlerRateLimitError) {
    throw error
  }
  if (error instanceof CrawlerHttpClientError && (error.status === 404 || error.status === 410)) {
    await updateReferralLinkAfterCrawl(linkId, {
      success: false,
      immediateDeactivation: true,
    })
    return
  }

  const isCrawlHealthFailure =
    error instanceof CrawlerHttpClientError ||
    error instanceof CrawlerServerError ||
    error instanceof CrawlerTimeoutError ||
    error instanceof CrawlerNetworkError ||
    error instanceof CrawlerResponseSizeExceededError ||
    error instanceof CrawlerSsrfError ||
    error instanceof CrawlerInvalidContentTypeError ||
    error instanceof HttpNoBodyError
  if (isCrawlHealthFailure) {
    await updateReferralLinkAfterCrawl(linkId, { success: false })
  }
  onError(error instanceof Error ? error : new Error(String(error)))
  if (!isCrawlHealthFailure) throw error
}

export async function handleCrawlReferralLinkResult(
  linkId: string,
  urlId: string,
  crawlerId: string,
  crawlResult: CrawlBasic,
): Promise<void> {
  if (isCsrEmptyShell(crawlResult)) {
    await enqueueCrawlBrowser({ linkId, urlId, crawlerId })
    return
  }

  await updateReferralLinkAfterCrawl(linkId, {
    success: true,
    crawlId: crawlResult.id,
  })
}
