import type { CrawlBrowserJobs } from '@queues/crawl-browser/types'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { CRAWL_BROWSER_QUEUE_NAME } from '@queues/crawl-browser/config'
import { getCrawlerById } from '@services/crawlers'
import { getUrlById } from '@services/urls/get'
import { Worker, type Job } from 'glide-mq'
import { processBrowserCrawl } from './processors.mts'

export const crawlBrowser = new Worker(
  CRAWL_BROWSER_QUEUE_NAME,
  async (job: Job) => {
    switch (job.name as CrawlBrowserJobs) {
      case 'crawl_browser': {
        const { linkId, urlId, crawlerId } = job.data ?? {}
        if (!linkId) throw new Error('crawl_browser job .linkId is required')
        if (!urlId) throw new Error('crawl_browser job .urlId is required')
        if (!crawlerId) throw new Error('crawl_browser job .crawlerId is required')

        const url = await getUrlById(urlId)
        if (!url) throw new Error(`URL not found: ${urlId}`)

        const crawler = await getCrawlerById(crawlerId)
        if (!crawler) throw new Error(`Crawler not found: ${crawlerId}`)

        await processBrowserCrawl(url, linkId, crawler)
        return
      }
      default:
        throw new Error(`crawl_browser: unrecognised job name "${job.name}"`)
    }
  },
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: 1,
  },
)
