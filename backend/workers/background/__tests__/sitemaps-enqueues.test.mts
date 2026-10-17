import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'
import { readAllQueueJobs } from '@voucha/test-helpers'
import {
  SITEMAPS_FAMILY_JOB,
  SITEMAPS_POSTS_INDEX_JOB,
  SITEMAPS_POST_DAY_JOB,
  SITEMAPS_POST_TYPE_INDEX_JOB,
  SITEMAPS_ROOT_INDEX_JOB,
} from '@queues/background/enqueues/sitemaps-jobs'
import {
  enqueueBulkUpdatePostDaySitemaps,
  enqueueMonthlyBackfillArchiveContinuation,
  enqueueUpdateFamilySitemap,
  enqueueUpdateLandingPagesSitemapForReconciliation,
  enqueueUpdatePostDaySitemapForReconciliation,
  enqueueUpdatePostsIndex,
  enqueueUpdatePostTypeIndex,
  enqueueUpdateRootIndex,
} from '@queues/sitemaps/enqueues'
import { getSitemapsOrderingKeyForDay } from '@queues/sitemaps/config'
import { sitemapsQueue } from '@queues/sitemaps/queues'

async function readLandingPageJobs() {
  return (await readAllQueueJobs(sitemapsQueue)).filter(
    job =>
      job.name === SITEMAPS_FAMILY_JOB.name &&
      (job.data as { family?: string }).family === 'landing-pages',
  )
}

describe('enqueues.generated', () => {
  it('getSitemapsOrderingKeyForDay uses the today group for the current UTC day', () => {
    expect(getSitemapsOrderingKeyForDay(getCurrentUtcDay())).toBe('post_day_today')
  })

  it('getSitemapsOrderingKeyForDay uses the past group for older UTC days', () => {
    expect(getSitemapsOrderingKeyForDay('2026-01-01')).toBe('post_day_past')
  })

  it('enqueueUpdateFamilySitemap enqueues topics into the indexes lane with family dedup', async () => {
    const priority = 1_000 + Math.floor(Math.random() * 1_000)
    await enqueueUpdateFamilySitemap('topics', priority)

    const jobs = (await readAllQueueJobs(sitemapsQueue)).filter(
      job => job.name === SITEMAPS_FAMILY_JOB.name && job.opts.priority === priority,
    )

    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.data).toEqual({ family: 'topics' })
    expect(jobs[0]!.opts).toMatchObject({
      priority,
      ordering: { key: 'sitemaps:indexes', concurrency: 1 },
      deduplication: {
        id: 'family-index__topics',
        mode: 'throttle',
        ttl: 60_000,
      },
    })
  })

  it('enqueueUpdatePostDaySitemapForReconciliation accepts every durable rebuild', async () => {
    const day = `2099-${randomUUID()}`
    await enqueueUpdatePostDaySitemapForReconciliation('discussion', day)
    await enqueueUpdatePostDaySitemapForReconciliation('discussion', day)

    const matchingJobs = (await readAllQueueJobs(sitemapsQueue)).filter(
      job => (job.data as { postType?: string; day?: string }).day === day,
    )

    expect(matchingJobs).toHaveLength(2)
    for (const job of matchingJobs) {
      expect(job).toMatchObject({
        name: 'sitemaps.processUpdatePostDaySitemap',
        data: { postType: 'discussion', day },
        opts: {
          ordering: { key: 'sitemaps:post_day_past', concurrency: 1 },
        },
      })
      expect(job.opts.deduplication).toBeUndefined()
    }
  })

  it('enqueues a bulk of post-day rebuilds into the day lane, with or without a priority', async () => {
    const priority = 1 + Math.floor(Math.random() * 400)
    const day = `2098-${randomUUID()}`
    const prioritizedDay = `2097-${randomUUID()}`

    await enqueueBulkUpdatePostDaySitemaps([{ postType: 'discussion', day }])
    await enqueueBulkUpdatePostDaySitemaps(
      [{ postType: 'discussion', day: prioritizedDay }],
      priority,
    )

    const jobs = (await readAllQueueJobs(sitemapsQueue)).filter(
      job => job.name === SITEMAPS_POST_DAY_JOB.name,
    )
    const plain = jobs.filter(job => (job.data as { day?: string }).day === day)
    const prioritized = jobs.filter(job => (job.data as { day?: string }).day === prioritizedDay)
    expect(plain).toHaveLength(1)
    expect(plain[0]!.opts).toMatchObject({
      ordering: { key: 'sitemaps:post_day_past', concurrency: 1 },
      deduplication: { id: `post-day__discussion__${day}`, mode: 'throttle' },
    })
    expect(prioritized).toHaveLength(1)
    expect(prioritized[0]!.opts.priority).toBe(priority)
  })

  it('enqueues the post-type, posts and root indexes into the indexes lane', async () => {
    const priority = 500 + Math.floor(Math.random() * 400)
    await enqueueUpdatePostTypeIndex('discussion', priority)
    await enqueueUpdatePostsIndex(priority + 1)
    await enqueueUpdateRootIndex(priority + 2)

    const jobs = await readAllQueueJobs(sitemapsQueue)
    const find = (name: string, jobPriority: number) =>
      jobs.filter(job => job.name === name && job.opts.priority === jobPriority)
    const typeIndex = find(SITEMAPS_POST_TYPE_INDEX_JOB.name, priority)
    expect(typeIndex).toHaveLength(1)
    expect(typeIndex[0]!.data).toEqual({ postType: 'discussion' })
    expect(typeIndex[0]!.opts.deduplication).toMatchObject({ id: 'type-index__discussion' })
    const postsIndex = find(SITEMAPS_POSTS_INDEX_JOB.name, priority + 1)
    expect(postsIndex).toHaveLength(1)
    expect(postsIndex[0]!.opts.deduplication).toMatchObject({ id: 'sitemaps:posts-index' })
    const rootIndex = find(SITEMAPS_ROOT_INDEX_JOB.name, priority + 2)
    expect(rootIndex).toHaveLength(1)
    expect(rootIndex[0]!.opts.deduplication).toMatchObject({ id: 'sitemaps:root-index' })
    for (const job of [...typeIndex, ...postsIndex, ...rootIndex]) {
      expect(job.opts.ordering).toEqual({ key: 'sitemaps:indexes', concurrency: 1 })
    }
  })

  it('carries a priority on a reconciliation post-day rebuild', async () => {
    const priority = 1_000 + Math.floor(Math.random() * 400)
    const day = `2096-${randomUUID()}`
    await enqueueUpdatePostDaySitemapForReconciliation('discussion', day, priority)

    const jobs = (await readAllQueueJobs(sitemapsQueue)).filter(
      job => (job.data as { day?: string }).day === day,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.opts.priority).toBe(priority)
  })

  it('accepts each reconciliation landing-pages rebuild despite the family throttle', async () => {
    await enqueueUpdateFamilySitemap('landing-pages')
    const before = (await readLandingPageJobs()).filter(job => job.opts.deduplication === undefined)
    await enqueueUpdateLandingPagesSitemapForReconciliation()
    await enqueueUpdateLandingPagesSitemapForReconciliation()

    const jobs = await readLandingPageJobs()
    const reconciliation = jobs.filter(job => job.opts.deduplication === undefined)
    expect(reconciliation).toHaveLength(before.length + 2)
    for (const job of jobs) {
      expect(job.opts.ordering).toEqual({ key: 'sitemaps:indexes', concurrency: 1 })
    }
  })

  it('chains an archive page by its cursor so a retried page cannot double the continuation', async () => {
    const afterDay = `2020-${randomUUID()}`
    const job = await enqueueMonthlyBackfillArchiveContinuation(afterDay)

    expect(job).toMatchObject({
      id: `sitemaps.processMonthlyBackfillArchiveDispatcher__${afterDay}`,
      data: { afterDay },
      opts: {
        priority: 100,
        ordering: { key: 'sitemaps:dispatcher', concurrency: 1 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    })
  })
})
