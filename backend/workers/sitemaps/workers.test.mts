import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import {
  createTestUser,
  overrideDynamicConfigFieldsForTest,
  readAllQueueJobs,
  withDominantPostFixtures,
} from '@voucha/test-helpers'
import { spyOnSitemapObjectStore } from '@voucha/test-helpers/sitemap-object-store'
import { getSitemapPostDayData } from '@voucha/test-helpers/sitemap-queue-jobs'
import { sitemapsQueue } from '@queues/sitemaps/queues'
import { sitemapsWorkConfig } from '@services/sitemaps/work-limits'
import { sitemapsHandlers } from './workers.mts'

function handlerFor(localName: string) {
  const handler = sitemapsHandlers.find(candidate => candidate.job.name === `sitemaps.${localName}`)
  if (!handler) throw new Error(`No sitemaps handler for ${localName}`)
  return handler
}

/** Runs the registered handler with the same payload shape as a queued sitemap job. */
function run(localName: string, data: Record<string, unknown> = {}) {
  return handlerFor(localName).handle({ data } as Job<never>)
}

function uniqueDay() {
  const random = randomUUID().replaceAll('-', '')
  const year = 4000 + (Number.parseInt(random.slice(0, 4), 16) % 5000)
  const month = 1 + (Number.parseInt(random.slice(4, 6), 16) % 12)
  const day = 1 + (Number.parseInt(random.slice(6, 8), 16) % 28)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function postDayIndexKey(day: string) {
  return `posts/${day.replaceAll('-', '/')}/discussion/index.xml`
}

describe('sitemaps handler routing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('registers one handler for every sitemaps job', () => {
    expect(sitemapsHandlers.map(handler => handler.job.name).toSorted()).toEqual([
      'sitemaps.processMonthlyBackfillArchiveDispatcher',
      'sitemaps.processNightlyBackfillWeekDispatcher',
      'sitemaps.processRetiredSitemapCleanup',
      'sitemaps.processUpdateFamilySitemap',
      'sitemaps.processUpdatePostDaySitemap',
      'sitemaps.processUpdatePostTypeIndex',
      'sitemaps.processUpdatePostsIndex',
      'sitemaps.processUpdateRootIndex',
      'sitemaps.processWeeklyBackfillMonthDispatcher',
    ])
  })

  it('routes a post-day job through validated type and day data to publication', async () => {
    const objects = new Map<string, Buffer>()
    spyOnSitemapObjectStore(objects, () => undefined)
    const day = uniqueDay()

    await run('processUpdatePostDaySitemap', { postType: 'discussion', day })

    expect(objects.has(postDayIndexKey(day))).toBe(true)
  })

  it('hands an unfinished post-day generation its continuation id and rejects malformed data', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, { generation_page_row_limit: 1 }),
    )
    const day = uniqueDay()
    const objects = new Map<string, Buffer>()
    spyOnSitemapObjectStore(objects, () => undefined)
    await withDominantPostFixtures(
      [
        { postType: 'discussion', votesScoreUp: 1, createdAt: new Date(`${day}T12:00:00.000Z`) },
        { postType: 'discussion', votesScoreUp: 1, createdAt: new Date(`${day}T13:00:00.000Z`) },
      ],
      async () => {
        const beforeIds = new Set((await readAllQueueJobs(sitemapsQueue)).map(job => job.id))
        await run('processUpdatePostDaySitemap', { postType: 'discussion', day })
        const progressKey = `posts/${day.replaceAll('-', '/')}/discussion/_progress.json`
        const progress = JSON.parse(objects.get(progressKey)!.toString()) as {
          generation_id: string
        }
        const continuation = (await readAllQueueJobs(sitemapsQueue)).find(
          job =>
            !beforeIds.has(job.id) &&
            job.name === 'sitemaps.processUpdatePostDaySitemap' &&
            getSitemapPostDayData(job)?.day === day &&
            getSitemapPostDayData(job)?.generationId === progress.generation_id,
        )
        expect(continuation).toBeDefined()
        await run('processUpdatePostDaySitemap', getSitemapPostDayData(continuation!)!)
        expect(objects.has(postDayIndexKey(day))).toBe(true)
      },
    )
    expect(() => run('processUpdateFamilySitemap', { family: 'topics', generationId: '' })).toThrow(
      'generationId is required',
    )
  })

  it('routes index and family jobs to real generated objects', async () => {
    const objects = new Map<string, Buffer>()
    spyOnSitemapObjectStore(objects, () => undefined)
    await run('processUpdatePostTypeIndex', { postType: 'review' })
    await run('processUpdatePostsIndex')
    await run('processUpdateRootIndex')
    expect(objects.has('sitemaps/types/review.xml')).toBe(true)
    expect(objects.has('sitemaps/posts.xml')).toBe(true)
    expect(objects.has('sitemaps/root.xml')).toBe(true)

    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, { generation_page_row_limit: 1 }),
    )
    await createTestUser()
    await run('processUpdateFamilySitemap', { family: 'users' })
    expect(
      objects.has('families/users/_progress.json') || objects.has('sitemaps/families/users.xml'),
    ).toBe(true)
  })

  it('routes dispatcher jobs through real queue admission and archive state', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, {
        nightly_backfill_days: 1,
        weekly_backfill_days: 1,
        archive_backfill_day_page_size: 1,
      }),
    )
    const archiveYear = 2000 + (Number.parseInt(randomUUID().slice(0, 4), 16) % 20)
    const archiveDay = `${archiveYear}-01-01`
    const nextDay = `${archiveYear}-01-02`
    const objects = new Map<string, Buffer>([
      [
        'sitemaps/meta/posts-tracked-range.json',
        Buffer.from(JSON.stringify({ earliestDay: archiveDay, latestDay: archiveDay })),
      ],
    ])
    spyOnSitemapObjectStore(objects, () => undefined)
    const addBulk = vi.spyOn(sitemapsQueue, 'addBulk')
    await run('processNightlyBackfillWeekDispatcher')
    await run('processWeeklyBackfillMonthDispatcher')
    await run('processMonthlyBackfillArchiveDispatcher', { afterDay: archiveDay })
    await run('processRetiredSitemapCleanup')
    const admitted = addBulk.mock.calls.flatMap(([jobs]) => jobs)
    expect(
      admitted.some(
        job =>
          job.name === 'sitemaps.processUpdatePostDaySitemap' &&
          getSitemapPostDayData(job)?.day === nextDay,
      ),
    ).toBe(true)
    expect(objects.get('sitemaps/retired/_cursor.json')).toBeDefined()
  })

  it('rejects malformed job data before processing', () => {
    expect(() => run('processUpdatePostDaySitemap', { postType: 'unknown' })).toThrow(
      'Unsupported postType: unknown',
    )
    expect(() => run('processUpdateFamilySitemap', {})).toThrow('family is required')
  })
})
