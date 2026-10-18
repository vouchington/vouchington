import type { CrawlerJobs } from '@queues/crawler/types'
import type { CrawlUrlOptions } from '@services/crawls/crawl-url/types'
import { crawlUrl } from '@services/crawls/crawl-url'
import type { Job } from 'glide-mq'
import { buildCrawlerJobResult, handleCrawlerProcessorError } from './processors/outcomes.mts'
import { completeRssFeedImportDiscovery } from '@services/rss-feeds/discover-feed'

export async function processCrawlerJob(
  job: Job,
  dependencies?: CrawlUrlOptions['dependencies'],
): Promise<unknown> {
  switch (job.name as CrawlerJobs) {
    case 'crawl_url': {
      const urlId = job.data?.url_id
      if (!urlId) throw new Error('Crawl URL job .url_id is required')
      const rateLimitRetryCount = job.data?.rate_limit_retry_count ?? 0
      const crawlTimeoutMs =
        typeof job.data?.crawl_timeout_ms === 'number' ? job.data.crawl_timeout_ms : undefined
      const ensureCrawlerForRedirects = job.data?.ensure_crawler_for_redirects === true
      const ignoreRobotsTxt = job.data?.should_ignore_robots_txt === true
      const maxResponseSizeBytes =
        typeof job.data?.max_response_size_bytes === 'number'
          ? job.data.max_response_size_bytes
          : undefined
      const preserveHttpRedirects = job.data?.preserve_http_redirects === true
      const skipCanonicalUrl = job.data?.skip_canonical_url === true
      const skipChunks = job.data?.skip_chunks === true
      const skipEmbedResolution = job.data?.skip_embed_resolution === true
      const skipCreatedEventsForRedirects = job.data?.skip_created_events_for_redirects === true
      const importRowId =
        typeof job.data?.import_row_id === 'string' ? job.data.import_row_id : undefined
      const importDiscoveryGeneration =
        typeof job.data?.import_discovery_generation === 'string'
          ? job.data.import_discovery_generation
          : undefined
      const priority = typeof job.opts?.priority === 'number' ? job.opts.priority : undefined
      const crawlOptions: CrawlUrlOptions | undefined =
        crawlTimeoutMs != null ||
        ensureCrawlerForRedirects ||
        ignoreRobotsTxt ||
        maxResponseSizeBytes != null ||
        preserveHttpRedirects ||
        skipCanonicalUrl ||
        skipChunks ||
        skipEmbedResolution ||
        skipCreatedEventsForRedirects ||
        dependencies
          ? {
              ensureCrawlerForRedirects,
              ignoreRobotsTxt,
              preserveHttpRedirects,
              skipCanonicalUrl,
              skipChunks,
              skipEmbedResolution,
              skipCreatedEventsForRedirects,
              ...(dependencies ? { dependencies } : {}),
              ...(crawlTimeoutMs != null ? { timeoutMs: crawlTimeoutMs } : {}),
              ...(maxResponseSizeBytes != null ? { maxResponseSizeBytes } : {}),
            }
          : undefined
      let crawlResult: Awaited<ReturnType<typeof crawlUrl>>
      try {
        crawlResult = await crawlUrl(urlId, 0, new Set(), crawlOptions)
      } catch (err) {
        try {
          return await handleCrawlerProcessorError(urlId, rateLimitRetryCount, err, {
            crawlTimeoutMs,
            ensureCrawlerForRedirects,
            ignoreRobotsTxt,
            maxResponseSizeBytes,
            preserveHttpRedirects,
            priority,
            skipCanonicalUrl,
            skipChunks,
            skipEmbedResolution,
            skipCreatedEventsForRedirects,
            importRowId,
            importDiscoveryGeneration,
          })
        } catch (err) {
          if (
            importRowId &&
            importDiscoveryGeneration &&
            job.attemptsMade + 1 >= (job.opts.attempts ?? 3)
          )
            await completeRssFeedImportDiscovery(
              importRowId,
              urlId,
              importDiscoveryGeneration,
              null,
            )
          throw err
        }
      }
      // Persistence failures leave discovery pending; they are not failed crawls.
      if (!crawlResult) {
        if (importRowId && importDiscoveryGeneration)
          await completeRssFeedImportDiscovery(importRowId, urlId, importDiscoveryGeneration, null)
        return null
      }

      if (importRowId && importDiscoveryGeneration)
        await completeRssFeedImportDiscovery(
          importRowId,
          urlId,
          importDiscoveryGeneration,
          buildCrawlerJobResult(crawlResult),
        )

      /* v8 ignore next -- successful network crawls are covered in crawl-url tests; buildCrawlerJobResult covers worker result shaping. */
      return buildCrawlerJobResult(crawlResult)
    }
    default:
      throw new Error(`Crawler job ${job.name} not found`)
  }
}
