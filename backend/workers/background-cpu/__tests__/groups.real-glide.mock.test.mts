import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { QueueEvents } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { enqueueBulkCrawlReferralLinks } from '@queues/crawl-referral-links/enqueues'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const url = requireBackgroundCpuJob('crawl.crawl_url')
const referral = requireBackgroundCpuJob('crawl.crawl_referral_link')
const single = requireBackgroundCpuJob('bedrock-embeddings.post')
const singleTopic = requireBackgroundCpuJob('bedrock-embeddings.topic')
const creation = requireBackgroundCpuJob('bedrock-embeddings.create_posts')
const imageCreation = requireBackgroundCpuJob('bedrock-embeddings.create_images')

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
      concurrency: 2,
      rateLimit: { max: 10, duration: 1_000 },
    })
    expect(singleTopic.options.ordering).toEqual(single.options.ordering)
  })

  it('configures separate single-slot lanes for creation types', () => {
    expect(creation.options.ordering).toEqual({
      key: 'bedrock-embeddings:creation:posts',
      concurrency: 1,
    })
    expect(imageCreation.options.ordering).toEqual({
      key: 'bedrock-embeddings:creation:images',
      concurrency: 1,
    })
  })

  it('admits ready text while a delayed image retains its own ordering slot', async ({
    signal,
  }) => {
    let imageAttempts = 0
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const harness = await startRealGlideBackgroundLifecycle({
      queueNamePrefix: 'creation_ordering_fairness',
      connection,
      processor: job => {
        if (job.name !== imageCreation.name) return Promise.resolve()
        imageAttempts += 1
        if (imageAttempts === 1) return job.moveToDelayed(Date.now() + 20_000)
        return Promise.resolve()
      },
      concurrency: 2,
    })
    const events = new QueueEvents(harness.queue.name, { ...connection, lastEventId: '0' })
    try {
      await events.waitUntilReady()
      const delayed = once(events, 'delay-changed', { signal })
      const image = await harness.add(imageCreation, {})
      expect((await delayed)[0]).toMatchObject({ jobId: image.id })
      expect(await image.getState()).toBe('delayed')

      const text = await harness.add(creation, {})
      expect(await harness.settled(text)).toBe('completed')
      expect(imageAttempts).toBe(1)
      expect(await image.getState()).toBe('delayed')

      await image.promote()
      expect(await harness.settled(image)).toBe('completed')
      expect(imageAttempts).toBe(2)
    } finally {
      await events.close()
      await harness.close()
    }
  })
})
