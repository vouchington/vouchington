import { Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  processRetainedSweep,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { crawlHostnamesQueue } from '@queues/crawl-hostnames/queues'
import {
  enqueueBulkCrawlHostname,
  enqueueCrawlTier1Dispatcher,
  enqueueCrawlTier2Dispatcher,
} from '@queues/crawl-hostnames/enqueues'
import { scheduledJobManifest as crawlManifest } from '@queues/crawl-hostnames/enqueues/schedules'
import { crawlReferralLinksQueue } from '@queues/crawl-referral-links/queues'
import { enqueueCrawlReferralLinksDispatcher } from '@queues/crawl-referral-links/enqueues'
import { scheduledJobManifest as referralManifest } from '@queues/crawl-referral-links/enqueues/schedules'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import { enqueueUnfurlReferralLinksDispatcher } from '@queues/unfurl-referral-links/enqueues'
import { scheduledJobManifest as unfurlManifest } from '@queues/unfurl-referral-links/enqueues/schedules'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import { enqueueDispatchFindYourFriends } from '@queues/find-your-friends/enqueues'
import { scheduledJobManifest as friendsManifest } from '@queues/find-your-friends/enqueues/schedules'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const sweepStartedAt = '2026-07-17T00:00:00.000Z'
const fixtures = [
  {
    label: 'tier1',
    queue: crawlHostnamesQueue,
    manifest: crawlManifest,
    schedulerId: 'crawl_tier1_dispatcher',
    work: 'crawl_tier1_dispatcher',
    root: enqueueCrawlTier1Dispatcher,
  },
  {
    label: 'tier2',
    queue: crawlHostnamesQueue,
    manifest: crawlManifest,
    schedulerId: 'crawl_tier2_dispatcher',
    work: 'crawl_tier2_dispatcher',
    root: enqueueCrawlTier2Dispatcher,
  },
  {
    label: 'referral',
    queue: crawlReferralLinksQueue,
    manifest: referralManifest,
    schedulerId: 'crawl_referral_links_dispatcher',
    work: 'crawl_referral_links_dispatcher',
    root: enqueueCrawlReferralLinksDispatcher,
  },
  {
    label: 'unfurl',
    queue: unfurlReferralLinksQueue,
    manifest: unfurlManifest,
    schedulerId: 'unfurl_referral_links_dispatcher',
    work: 'unfurl_referral_links_dispatcher',
    root: enqueueUnfurlReferralLinksDispatcher,
  },
  {
    label: 'friends',
    queue: findYourFriendsQueue,
    manifest: friendsManifest,
    schedulerId: 'dispatchFindYourFriends',
    work: 'dispatchFindYourFriends',
    root: enqueueDispatchFindYourFriends,
  },
] as const

describe('periodic sweep coalescing', () => {
  it.each(fixtures)('retains one $label job through repeated scheduler roots', async fixture => {
    const { queue } = fixture
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const repeated = Promise.withResolvers<void>()
    const completed = Promise.withResolvers<void>()
    const manual = Promise.withResolvers<void>()
    const seen: { id: string; data: unknown }[] = []
    const cursorId = crypto.randomUUID()
    const initial =
      fixture.label === 'friends'
        ? {
            sweepStartedAt,
            upperIds: { facebook: 'tail', x: null, github: null },
            afterIds: {},
            finishedProviders: [],
          }
        : { cursor: { sweepStartedAt } }
    const advanced =
      fixture.label === 'friends'
        ? { ...initial, afterIds: { facebook: 'tail' } }
        : fixture.label === 'referral'
          ? { cursor: { sweepStartedAt, afterWork: { dueAt: '-infinity', id: cursorId } } }
          : fixture.label === 'unfurl'
            ? { cursor: { sweepStartedAt, after: { requestedAt: sweepStartedAt, id: cursorId } } }
            : { cursor: { sweepStartedAt, afterId: cursorId } }
    let roots = 0
    const worker = new Worker(
      queue.name,
      async (job: Job) => {
        if (job.name !== fixture.work) {
          const result = await fixture.root()
          if (++roots >= 2) repeated.resolve()
          return result
        }
        if (job.data?.urlId) {
          manual.resolve()
          return
        }
        seen.push({ id: job.id, data: job.data })
        return processRetainedSweep(job, async save => {
          if (seen.length === 1) {
            await save(initial)
            started.resolve()
            await release.promise
            await save(advanced)
            return { hasMore: true }
          }
          return { hasMore: false }
        })
      },
      {
        connection: workerQueueConnection,
        prefix: workerQueuePrefix,
        concurrency: 5,
        blockTimeout: 1000,
      },
    )
    worker.on('completed', job => {
      if (job.name === fixture.work && !job.data?.urlId) completed.resolve()
    })
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
      await repeated.promise
      expect(seen).toHaveLength(1)
      const active = await queue.getJob(seen[0]!.id)
      expect(active?.data).toEqual(initial)
      expect(active?.opts.deduplication?.mode).toBe('simple')
      expect(active?.opts.ordering).toBeUndefined()
      if (fixture.label === 'referral') {
        await enqueueCrawlReferralLinksDispatcher({
          urlId: crypto.randomUUID(),
          cursor: { sweepStartedAt },
        })
        await manual.promise
      }
      await upsertScheduledJobManifest(queue, defineScheduledJobManifest(queue.name, []))
      release.resolve()
      await completed.promise
      expect(seen.map(item => item.id)).toEqual([active!.id, active!.id])
      expect(seen[1]!.data).toEqual(advanced)
      expect((await queue.getJob(active!.id))?.attemptsMade).toBe(0)
    } finally {
      release.resolve()
      await worker.close(true)
      await queue.obliterate({ force: true })
    }
  })

  it('coalesces daily hostname fanout without suppressing a different hostname', async () => {
    const queue = crawlHostnamesQueue
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
        name: 'crawl_urls_per_hostname_dispatcher',
        data: { hostname_id: hostname },
      })
      expect(jobs).toHaveLength(1)
      expect(jobs[0]!.data).toEqual({ hostname_id: hostname, cursor: { sweepStartedAt } })
      expect(jobs[0]!.opts.deduplication?.mode).toBe('simple')
    } finally {
      release.resolve()
      await worker.close(true)
      await queue.obliterate({ force: true })
      await Promise.all([
        queue.close(),
        crawlReferralLinksQueue.close(),
        unfurlReferralLinksQueue.close(),
        findYourFriendsQueue.close(),
      ])
    }
  })
})
