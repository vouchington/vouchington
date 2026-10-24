import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { enqueueBulkCrawlReferralLinks } from '@queues/crawl-referral-links/enqueues'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const url = requireBackgroundCpuJob('crawl.crawl_url')
const referral = requireBackgroundCpuJob('crawl.crawl_referral_link')
const single = requireBackgroundCpuJob('bedrock-embeddings.post')
const singleTopic = requireBackgroundCpuJob('bedrock-embeddings.topic')
const creation = requireBackgroundCpuJob('bedrock-embeddings.create_posts')

describe('background-cpu groups through real GlideMQ', () => {
  it('gives URL and referral crawls the same hostname ordering options', async () => {
    const hostnameId = randomUUID()
    const rateLimitMs = 400
    const [urlJob] = await enqueueBulkCrawlUrls([{ urlId: randomUUID() }], {
      hostnameId,
      rateLimitMs,
    })
    const referralResult = await enqueueBulkCrawlReferralLinks(
      [{ linkId: randomUUID(), urlId: randomUUID(), referralProgramId: randomUUID() }],
      { hostnameId, rateLimitMs },
    )
    if (!Array.isArray(referralResult)) throw new Error('Expected referral crawl jobs')
    const [referralJob] = referralResult
    if (!urlJob || !referralJob) throw new Error('Expected production crawl jobs')
    try {
      expect(urlJob.name).toBe(url.name)
      expect(referralJob.name).toBe(referral.name)
      expect(urlJob.opts.ordering).toEqual({
        key: `crawl:${hostnameId}`,
        concurrency: 1,
        rateLimit: { max: 1, duration: rateLimitMs },
      })
      expect(referralJob.opts.ordering).toEqual(urlJob.opts.ordering)
    } finally {
      await Promise.all([urlJob.remove(), referralJob.remove()])
    }
  })

  it('keeps Bedrock single definitions in the same production ordering group', () => {
    expect(single.options.ordering).toEqual({
      key: 'bedrock-embeddings:single',
      concurrency: 10,
      rateLimit: { max: 10, duration: 1_000 },
    })
    expect(singleTopic.options.ordering).toEqual(single.options.ordering)
  })

  it('configures batch creation jobs with ordering concurrency one', () => {
    expect(creation.options.ordering).toEqual({
      key: 'bedrock-embeddings:creation',
      concurrency: 1,
    })
  })
})
