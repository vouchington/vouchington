import { backgroundCpu } from '@queues/background-cpu/queues'
import { Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  createWorker,
  processRetainedSweep,
  workerQueueCommandClient,
} from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { enqueueBulkCrawlHostname } from '@queues/crawl-dispatch/enqueues/hostnames'
import { scheduledJobManifest as crawlManifest } from '@queues/crawl-dispatch/enqueues/schedules'
import { scheduledJobManifest as referralManifest } from '@queues/crawl-referral-links/enqueues/schedules'
import { scheduledJobManifest as unfurlManifest } from '@queues/unfurl-referral-links/enqueues/schedules'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import { scheduledJobManifest as friendsManifest } from '@queues/find-your-friends/enqueues/schedules'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const sweepStartedAt = '2026-07-17T00:00:00.000Z'
const PROMOTION_INTERVAL_MS = 100
const fixtures = [
  {
    label: 'hostnames',
    queue: backgroundCpu,
    manifest: crawlManifest,
    schedulerId: 'crawl:crawl_hostnames_dispatcher',
    work: 'crawl.crawl_hostnames_dispatcher',
  },
  {
    label: 'tier1',
    queue: backgroundCpu,
    manifest: crawlManifest,
    schedulerId: 'crawl:crawl_tier1_dispatcher',
    work: 'crawl.crawl_tier1_dispatcher',
  },
  {
    label: 'tier2',
    queue: backgroundCpu,
    manifest: crawlManifest,
    schedulerId: 'crawl:crawl_tier2_dispatcher',
    work: 'crawl.crawl_tier2_dispatcher',
  },
  {
    label: 'referral',
    queue: backgroundCpu,
    manifest: referralManifest,
    schedulerId: 'crawl:referral-links-dispatcher',
    work: 'crawl.crawl_referral_links_dispatcher',
  },
  {
    label: 'unfurl',
    queue: backgroundCpu,
    manifest: unfurlManifest,
    schedulerId: 'crawl:unfurl-referral-links-dispatcher',
    work: 'crawl.unfurl_referral_links_dispatcher',
  },
  {
    label: 'friends',
    queue: findYourFriendsQueue,
    manifest: friendsManifest,
    schedulerId: 'dispatchFindYourFriends',
    work: 'dispatchFindYourFriends',
  },
] as const

describe('periodic sweep coalescing', () => {
  it.each(fixtures)('runs $label scheduler root directly', async fixture => {
    const { queue } = fixture
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const seen: string[] = []
    const worker = createWorker(
      queue.name,
      async (job: Job) => {
        seen.push(job.name)
        started.resolve()
        await release.promise
      },
      { concurrency: 5, blockTimeout: 1000, promotionInterval: PROMOTION_INTERVAL_MS },
    )
    const template = fixture.manifest.jobs.find(job => job.schedulerId === fixture.schedulerId)!
    try {
      await worker.waitUntilReady()
      await upsertScheduledJobManifest(
        queue,
        defineScheduledJobManifest(queue.name, [
          {
            ...template,
            repeat: () => ({ every: 1000 }),
            subMinuteJustification: 'Synthetic scheduler repetition within the test timeout.',
          },
        ]),
      )
      await started.promise
      expect(seen[0]).toBe(fixture.work)
      await upsertScheduledJobManifest(queue, defineScheduledJobManifest(queue.name, []))
    } finally {
      release.resolve()
      await worker.close(true)
      await queue.obliterate({ force: true })
      const base = `${workerQueuePrefix ?? 'glide'}:{${queue.name}}`
      await workerQueueCommandClient.unlink([
        `${base}:run:${fixture.schedulerId}`,
        `${base}:run:${fixture.schedulerId}:previous`,
        `${base}:run-metrics`,
      ])
    }
  })

  it('coalesces daily hostname fanout without suppressing a different hostname', async () => {
    const queue = backgroundCpu
    const hostname = crypto.randomUUID()
    const otherHostname = crypto.randomUUID()
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const otherStarted = Promise.withResolvers<void>()
    let primaryRuns = 0
    const worker = new Worker(
      queue.name,
      async (job: Job) => {
        if (job.data.hostname_id === otherHostname) {
          otherStarted.resolve()
          return
        }
        primaryRuns++
        return processRetainedSweep(job, async save => {
          await save({ hostname_id: hostname, cursor: { sweepStartedAt } })
          started.resolve()
          await release.promise
          return { hasMore: false }
        })
      },
      {
        connection: workerQueueConnection,
        prefix: workerQueuePrefix,
        concurrency: 5,
        blockTimeout: 1000,
        promotionInterval: PROMOTION_INTERVAL_MS,
      },
    )
    try {
      await worker.waitUntilReady()
      await enqueueBulkCrawlHostname([hostname])
      await started.promise
      await enqueueBulkCrawlHostname([hostname, otherHostname])
      await otherStarted.promise
      expect(primaryRuns).toBe(1)
      const jobs = await queue.searchJobs({
        name: 'crawl.crawl_urls_per_hostname_dispatcher',
        data: { hostname_id: hostname },
      })
      expect(jobs).toHaveLength(1)
      expect(jobs[0]!.data).toEqual({ hostname_id: hostname, cursor: { sweepStartedAt } })
      expect(jobs[0]!.opts.deduplication?.mode).toBe('simple')
    } finally {
      release.resolve()
      await worker.close(true)
      await queue.obliterate({ force: true })
      await Promise.all([queue.close(), findYourFriendsQueue.close()])
    }
  })
})
