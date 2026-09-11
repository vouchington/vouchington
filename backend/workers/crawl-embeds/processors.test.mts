import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import * as crawlEmbedServices from '@services/crawl-embeds'
import { processCrawlEmbedsJob } from './processors.mts'

function job(name: string, data: Record<string, unknown> = {}): Job {
  return { name, data } as Job
}

describe('processCrawlEmbedsJob', () => {
  it('routes backfill and crawl resolution jobs', async () => {
    const backfillSpy = vi
      .spyOn(crawlEmbedServices, 'backfillPendingCrawlEmbeds')
      .mockResolvedValueOnce(undefined)
    const resolveSpy = vi
      .spyOn(crawlEmbedServices, 'resolveCrawlOEmbed')
      .mockResolvedValueOnce('resolved')

    await processCrawlEmbedsJob(job('backfill_crawl_embeds'))
    await processCrawlEmbedsJob(job('resolve_crawl_oembed', { crawl_id: 'crawl-id' }))

    expect(backfillSpy).toHaveBeenCalledOnce()
    expect(resolveSpy).toHaveBeenCalledWith('crawl-id')
  })

  it('rejects malformed and unknown jobs', async () => {
    await expect(processCrawlEmbedsJob(job('resolve_crawl_oembed'))).rejects.toThrow(
      'Resolve crawl oEmbed job .crawl_id is required',
    )
    await expect(processCrawlEmbedsJob(job('unknown'))).rejects.toThrow(
      'Crawl embeds job unknown not found',
    )
  })
})
