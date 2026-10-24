import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { enqueueBulkCrawlReferralLinks } from '@queues/crawl-referral-links/enqueues'
import {
  startBackgroundCpuHarness,
  type BackgroundCpuHarness,
} from '@voucha/test-helpers/real-glide-background-cpu'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const url = requireBackgroundCpuJob('crawl.crawl_url')
const referral = requireBackgroundCpuJob('crawl.crawl_referral_link')
const single = requireBackgroundCpuJob('bedrock-embeddings.post')
const singleTopic = requireBackgroundCpuJob('bedrock-embeddings.topic')
const creation = requireBackgroundCpuJob('bedrock-embeddings.create_posts')

describe('background-cpu groups through real GlideMQ', () => {
  let harness: BackgroundCpuHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

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

  it('keeps batch creation concurrency at one across two workers', async () => {
    let active = 0
    let maxActive = 0
    const firstStarted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    harness = await startBackgroundCpuHarness({
      connection,
      workers: 2,
      bodies: {
        [creation.name]: async () => {
          active += 1
          maxActive = Math.max(maxActive, active)
          firstStarted.resolve()
          await release.promise
          active -= 1
        },
      },
    })
    try {
      const jobs = await Promise.all(
        Array.from({ length: 3 }, () => harness!.add(creation, { id: randomUUID() })),
      )
      await firstStarted.promise
      expect(active).toBe(1)
      release.resolve()
      await Promise.all(jobs.map(job => harness!.settled(job)))
      expect(maxActive).toBe(1)
    } finally {
      release.resolve()
    }
  })

  it('renews a long crawl lock while another queue job supplies the test clock', async () => {
    const handled: string[] = []
    const clockDone = Promise.withResolvers<void>()
    harness = await startBackgroundCpuHarness({
      connection,
      concurrency: 2,
      workerOptions: { stalledInterval: 1_000 },
      bodies: {
        [url.name]: async job => {
          handled.push(job.id)
          await clockDone.promise
        },
        [single.name]: () => clockDone.resolve(),
      },
    })
    const longJob = await harness.add(url, { urlId: randomUUID() }, { lockDuration: 1_000 })
    await harness.add(single, { id: randomUUID() }, { delay: 3_500 })
    await expect(harness.settled(longJob)).resolves.toBe('completed')
    expect(handled).toEqual([longJob.id])
    expect(harness.stalledJobIds).toEqual([])
  })
})
