import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueueEvents } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import {
  extendCpuProviderCooldownMs,
  getCpuProviderCooldownRemainingMs,
} from '@services/bedrock-embeddings/provider-cooldown'
import type { BackgroundCpuHandler, BackgroundCpuJobDefinition } from '@queues/background-cpu/types'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { enqueueBulkCrawlReferralLinks } from '@queues/crawl-referral-links/enqueues'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import {
  startBackgroundCpuHarness,
  type BackgroundCpuHarness,
} from '@voucha/test-helpers/real-glide-background-cpu'
import { createBackgroundCpuProcessor } from '../processors.mts'
import { withBedrockRateLimit } from '../processors/bedrock-rate.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const url = requireBackgroundCpuJob('crawl.crawl_url')
const referral = requireBackgroundCpuJob('crawl.crawl_referral_link')
const single = requireBackgroundCpuJob('bedrock-embeddings.post')
const singleTopic = requireBackgroundCpuJob('bedrock-embeddings.topic')
const creation = requireBackgroundCpuJob('bedrock-embeddings.create_posts')
const contentPost = requireBackgroundCpuJob('content-analysis.post')

describe('background-cpu groups through real GlideMQ', () => {
  let harness: BackgroundCpuHarness | undefined
  let events: QueueEvents | undefined

  afterEach(async () => {
    await events?.close()
    events = undefined
    await harness?.close()
    harness = undefined
  })

  it('shares one hostname rate window across URL and referral crawls', async () => {
    const started: number[] = []
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
      harness = await startBackgroundCpuHarness({
        connection,
        workers: 2,
        bodies: {
          [url.name]: () => started.push(Date.now()),
          [referral.name]: () => started.push(Date.now()),
        },
      })
      const jobs = await Promise.all([
        harness.add(url, { urlId: randomUUID() }, { ordering: urlJob.opts.ordering }),
        harness.add(referral, { linkId: randomUUID() }, { ordering: referralJob.opts.ordering }),
      ])
      await Promise.all(jobs.map(job => harness!.settled(job)))
      expect(started).toHaveLength(2)
      expect(Math.abs(started[1]! - started[0]!)).toBeGreaterThanOrEqual(300)
    } finally {
      await Promise.all([urlJob.remove(), referralJob.remove()])
    }
  })

  it('limits Bedrock singles to one group window across different entity types', async () => {
    expect(single.options.ordering).toEqual({
      key: 'bedrock-embeddings:single',
      concurrency: 10,
      rateLimit: { max: 10, duration: 1_000 },
    })
    expect(singleTopic.options.ordering).toEqual(single.options.ordering)
    const started: number[] = []
    harness = await startBackgroundCpuHarness({
      connection,
      workers: 2,
      bodies: {
        [single.name]: () => started.push(Date.now()),
        [singleTopic.name]: () => started.push(Date.now()),
      },
    })
    const ordering = {
      key: 'bedrock-embeddings:single',
      concurrency: 10,
      rateLimit: { max: 2, duration: 400 },
    }
    const jobs = await Promise.all(
      [single, singleTopic, single, singleTopic].map(definition =>
        harness!.add(definition, { id: randomUUID() }, { ordering }),
      ),
    )
    await Promise.all(jobs.map(job => harness!.settled(job)))
    const ordered = started.toSorted((a, b) => a - b)
    expect(ordered).toHaveLength(4)
    expect(ordered[2]! - ordered[0]!).toBeGreaterThanOrEqual(300)
  })

  it('cools the throttled Bedrock ordering group while another CPU domain keeps running', async () => {
    const startedBedrock: string[] = []
    const defaultOrdering = single.options.ordering
    if (!defaultOrdering) throw new Error('Expected Bedrock ordering lane')
    const ordering = {
      ...defaultOrdering,
      key: `bedrock-embeddings:single:${randomUUID()}`,
    }
    const throttle = Object.assign(new Error('Bedrock request throttled'), {
      name: 'ThrottlingException',
      $metadata: { httpStatusCode: 429 },
    })
    const handlers = new Map<string, BackgroundCpuHandler>([
      [
        single.name,
        {
          job: single,
          handle: job => {
            startedBedrock.push(job.id)
            if (startedBedrock.length === 1)
              return withBedrockRateLimit(async () => {
                throw throttle
              })
            return undefined
          },
        },
      ],
      [singleTopic.name, { job: singleTopic, handle: job => startedBedrock.push(job.id) }],
      [contentPost.name, { job: contentPost, handle: () => undefined }],
    ])
    harness = await startRealGlideBackgroundLifecycle<BackgroundCpuJobDefinition>({
      queueNamePrefix: 'background_cpu_bedrock_cooldown',
      connection,
      processor: createBackgroundCpuProcessor(handlers),
    })
    events = new QueueEvents(harness.queue.name, {
      ...connection,
      lastEventId: '0',
      blockTimeout: 1_000,
    })
    const delayedEvents: Array<{ jobId?: string }> = []
    const failedEvents: Array<{ jobId?: string; failedReason?: string }> = []
    events.on('delay-changed', event => delayedEvents.push(event))
    events.on('failed', event => failedEvents.push(event))
    await events.waitUntilReady()

    const limited = await harness.add(single, { id: randomUUID() }, { ordering })
    await harness.activated(limited, 1)
    // With one worker, the other-domain completion proves the first job's 429 was processed.
    const firstUnrelatedCompleted = once(events, 'completed')
    const firstUnrelated = await harness.add(contentPost, { id: randomUUID() })
    await expect(harness.settled(firstUnrelated)).resolves.toBe('completed')
    const [completionEvent] = await firstUnrelatedCompleted
    expect(completionEvent).toMatchObject({ jobId: firstUnrelated.id })
    const limitedAfterThrottle = await harness.queue.getJob(limited.id)
    expect(limitedAfterThrottle).toMatchObject({
      groupKey: ordering.key,
      attemptsMade: 0,
    })
    expect(await limitedAfterThrottle?.getState()).toBe('delayed')
    expect(delayedEvents).toContainEqual(expect.objectContaining({ jobId: limited.id }))
    expect(await getCpuProviderCooldownRemainingMs(ordering.key)).toBeGreaterThan(1_000)
    await extendCpuProviderCooldownMs(ordering.key, 1_000)
    expect(await getCpuProviderCooldownRemainingMs(ordering.key)).toBeGreaterThan(1_000)
    expect(failedEvents).toEqual([])

    const sameGroup = await harness.add(singleTopic, { id: randomUUID() }, { ordering })
    const secondUnrelatedCompleted = once(events, 'completed')
    const secondUnrelated = await harness.add(contentPost, { id: randomUUID() })
    await expect(harness.settled(secondUnrelated)).resolves.toBe('completed')
    const [secondCompletionEvent] = await secondUnrelatedCompleted
    expect(secondCompletionEvent).toMatchObject({ jobId: secondUnrelated.id })
    expect(startedBedrock).toEqual([limited.id])
    expect((await harness.queue.getJob(limited.id))?.attemptsMade).toBe(0)
    expect((await harness.queue.getJob(sameGroup.id))?.attemptsMade).toBe(0)
    expect(await (await harness.queue.getJob(sameGroup.id))?.getState()).toBe('delayed')
    expect(delayedEvents).toContainEqual(expect.objectContaining({ jobId: sameGroup.id }))
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
