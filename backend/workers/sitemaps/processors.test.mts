import { randomUUID } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import {
  createTestUser,
  overrideDynamicConfigFieldsForTest,
  readAllQueueJobs,
  withDominantPostFixtures,
} from '@voucha/test-helpers'
import { spyOnSitemapObjectStore } from '@voucha/test-helpers/sitemap-object-store'
import {
  getSitemapPostDayData,
  getSitemapArchiveBackfillData,
} from '@voucha/test-helpers/sitemap-queue-jobs'
import { backgroundQueue as sitemapsQueue } from '@voucha/test-helpers/shared-background-queue'
import {
  getSitemapFamilyProgress,
  putSitemapFamilyProgress,
} from '@services/sitemaps/generation-storage'
import { getSitemapFamilyManifest } from '@services/sitemaps/storage'
import { sitemapsWorkConfig } from '@services/sitemaps/work-limits'
import { getPreviousUtcDays } from '@ts-shared/utils/dates'
import {
  processUpdateFamilySitemap,
  processMonthlyBackfillArchiveDispatcher,
  processNightlyBackfillWeekDispatcher,
  processUpdatePostDaySitemap,
  processUpdatePostTypeIndex,
  processUpdatePostsIndex,
  processUpdateRootIndex,
  processWeeklyBackfillMonthDispatcher,
} from './processors.mts'

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

function postDayProgressKey(day: string) {
  return `posts/${day.replaceAll('-', '/')}/discussion/_progress.json`
}

describe('sitemap processors', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('publishes a post-day sitemap and admits dependent index work', async () => {
    const day = uniqueDay()
    const objects = new Map<string, Buffer>()
    spyOnSitemapObjectStore(objects, () => undefined)
    const add = vi.spyOn(sitemapsQueue, 'add')

    await processUpdatePostDaySitemap({ postType: 'discussion', day })

    expect(objects.has(postDayIndexKey(day))).toBe(true)
    const admittedNames = add.mock.calls.map(([name]) => name)
    expect(admittedNames).toContain('sitemaps.processUpdatePostTypeIndex')
    expect(admittedNames).toContain('sitemaps.processUpdatePostsIndex')
    expect(admittedNames).toContain('sitemaps.processUpdateRootIndex')
  })

  it('continues an unfinished day before publishing dependent indexes', async () => {
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
        await processUpdatePostDaySitemap({ postType: 'discussion', day })
        const progress = JSON.parse(objects.get(postDayProgressKey(day))!.toString()) as {
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
        expect(objects.has(postDayIndexKey(day))).toBe(false)
        await processUpdatePostDaySitemap({
          postType: 'discussion',
          day,
          generationId: progress.generation_id,
        })
        expect(objects.has(postDayIndexKey(day))).toBe(true)
      },
    )
  })

  it('preserves a completed post-day generation when an old continuation arrives', async () => {
    const day = uniqueDay()
    const objects = new Map<string, Buffer>()
    spyOnSitemapObjectStore(objects, () => undefined)
    await processUpdatePostDaySitemap({ postType: 'discussion', day })
    const published = objects.get(postDayIndexKey(day))
    const add = vi.spyOn(sitemapsQueue, 'add')

    await processUpdatePostDaySitemap({ postType: 'discussion', day, generationId: randomUUID() })

    expect(objects.get(postDayIndexKey(day))).toEqual(published)
    expect(add).not.toHaveBeenCalled()
  })

  it('preserves a family generation when an old continuation arrives', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, { generation_page_row_limit: 1 }),
    )
    await createTestUser()
    const objects = new Map<string, Buffer>()
    spyOnSitemapObjectStore(objects, () => undefined)
    await processUpdateFamilySitemap({ family: 'users' })
    const progress = objects.get('families/users/_progress.json')
    const published = objects.get('sitemaps/families/users.xml')
    const add = vi.spyOn(sitemapsQueue, 'add')

    await processUpdateFamilySitemap({ family: 'users', generationId: randomUUID() })

    expect(objects.get('families/users/_progress.json')).toEqual(progress)
    expect(objects.get('sitemaps/families/users.xml')).toEqual(published)
    expect(add).not.toHaveBeenCalled()
  })

  it('writes each sitemap index through real gzip storage', async () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://example.com')
    const objects = new Map<string, Buffer>()
    spyOnSitemapObjectStore(objects, () => undefined)

    await processUpdatePostTypeIndex('review')
    await processUpdatePostsIndex()
    await processUpdateRootIndex()

    expect(gunzipSync(objects.get('sitemaps/types/review.xml')!).toString()).toContain(
      '<sitemapindex',
    )
    expect(gunzipSync(objects.get('sitemaps/posts.xml')!).toString()).toContain(
      'https://example.com/sitemaps/review.xml',
    )
    expect(gunzipSync(objects.get('sitemaps/root.xml')!).toString()).toContain(
      'https://example.com/sitemaps/static.xml',
    )
  })

  it('publishes a completed family generation and admits root index work', async () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://example.com')
    const generationId = randomUUID()
    const pageKey = `families/users/${generationId}/1.xml`
    const objects = new Map<string, Buffer>()
    spyOnSitemapObjectStore(objects, () => undefined)
    objects.set(pageKey, gzipSync('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>'))
    await putSitemapFamilyProgress('users', {
      generation_id: generationId,
      started_at: new Date(Date.now() - 1000).toISOString(),
      content_hash: randomUUID(),
      high_water_id: null,
      after_id: null,
      after_path: null,
      page_count: 1,
      finished: true,
      previous_generation_id: null,
      previous_page_count: 0,
    })
    const add = vi.spyOn(sitemapsQueue, 'add')

    await processUpdateFamilySitemap({ family: 'users' })

    const index = objects.get('sitemaps/families/users.xml')
    expect(index).toBeDefined()
    const indexXml = gunzipSync(index!).toString()
    expect(indexXml).toContain(`https://example.com/sitemaps/users/${generationId}/1.xml`)
    expect(await getSitemapFamilyManifest('users')).toMatchObject({
      generation_id: generationId,
      active_page_count: 1,
    })
    expect(await getSitemapFamilyProgress('users')).toBeNull()
    expect(add.mock.calls.map(([name]) => name)).toContain('sitemaps.processUpdateRootIndex')
  })

  it('admits nightly post-day and family backfill jobs for a chosen UTC day', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, { nightly_backfill_days: 1 }),
    )
    const day = uniqueDay()
    const now = new Date(`${day}T08:00:00.000Z`)
    const objects = new Map<string, Buffer>()
    spyOnSitemapObjectStore(objects, () => undefined)
    const add = vi.spyOn(sitemapsQueue, 'add')
    const addBulk = vi.spyOn(sitemapsQueue, 'addBulk')

    await processNightlyBackfillWeekDispatcher(now)

    const postDayAdmissions = addBulk.mock.calls
      .flatMap(([jobs]) => jobs)
      .filter(job => getSitemapPostDayData(job)?.day === day)
    expect(postDayAdmissions).toHaveLength(SITEMAP_CONFIG.POST_TYPES.length)
    expect(add.mock.calls.map(([name]) => name)).toContain('sitemaps.processUpdateFamilySitemap')
  })

  it('admits weekly post-day jobs using the same queue contract', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, { weekly_backfill_days: 1 }),
    )
    const day = uniqueDay()
    const addBulk = vi.spyOn(sitemapsQueue, 'addBulk')

    await processWeeklyBackfillMonthDispatcher(new Date(`${day}T08:00:00.000Z`))

    const postDayAdmissions = addBulk.mock.calls
      .flatMap(([jobs]) => jobs)
      .filter(job => getSitemapPostDayData(job)?.day === day)
    expect(postDayAdmissions).toHaveLength(SITEMAP_CONFIG.POST_TYPES.length)
  })

  it('pages archive backfill from durable tracked range and chains its last day', async () => {
    const archiveYear = 4000 + (Number.parseInt(randomUUID().slice(0, 4), 16) % 5000)
    const now = new Date(`${archiveYear}-10-28T08:00:00.000Z`)
    const earliestDay = getPreviousUtcDays(34, { baseDate: now }).at(-1)!
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, { archive_backfill_day_page_size: 2 }),
    )
    const objects = new Map<string, Buffer>([
      [
        'sitemaps/meta/posts-tracked-range.json',
        Buffer.from(JSON.stringify({ earliestDay, latestDay: earliestDay })),
      ],
    ])
    spyOnSitemapObjectStore(objects, () => undefined)
    const add = vi.spyOn(sitemapsQueue, 'add')
    const addBulk = vi.spyOn(sitemapsQueue, 'addBulk')

    const first = await processMonthlyBackfillArchiveDispatcher(undefined, now)
    const firstAdmissions = addBulk.mock.calls.flatMap(([jobs]) => jobs)
    const firstDays = [
      ...new Set(firstAdmissions.map(job => getSitemapPostDayData(job)?.day)),
    ].toSorted()
    expect(first).toEqual({ enqueued: SITEMAP_CONFIG.POST_TYPES.length * 2, hasMore: true })
    expect(firstDays).toHaveLength(2)
    const continuation = add.mock.calls.find(
      ([name, data]) =>
        getSitemapArchiveBackfillData({ name, data })?.afterDay === firstDays.at(-1),
    )
    expect(continuation).toBeDefined()

    const second = await processMonthlyBackfillArchiveDispatcher(firstDays.at(-1), now)
    const allAdmissions = addBulk.mock.calls.flatMap(([jobs]) => jobs)
    expect(second.hasMore).toBe(false)
    expect(new Set(allAdmissions.map(job => getSitemapPostDayData(job)?.day)).size).toBe(4)
  })

  it('enqueues nothing for the archive when no day has been tracked', async () => {
    const objects = new Map<string, Buffer>()
    spyOnSitemapObjectStore(objects, () => undefined)
    const add = vi.spyOn(sitemapsQueue, 'add')
    const addBulk = vi.spyOn(sitemapsQueue, 'addBulk')
    const archiveYear = 4000 + (Number.parseInt(randomUUID().slice(0, 4), 16) % 5000)
    const now = new Date(`${archiveYear}-10-28T08:00:00.000Z`)

    const empty = await processMonthlyBackfillArchiveDispatcher(undefined, now)
    const emptyAdmissionCounts = [add.mock.calls.length, addBulk.mock.calls.length]

    const trackedDay = getPreviousUtcDays(34, { baseDate: now }).at(-1)!
    objects.set(
      'sitemaps/meta/posts-tracked-range.json',
      Buffer.from(JSON.stringify({ earliestDay: trackedDay, latestDay: trackedDay })),
    )
    const populated = await processMonthlyBackfillArchiveDispatcher(undefined, now)

    expect(populated.enqueued).toBeGreaterThan(0)
    expect(addBulk).toHaveBeenCalled()
    expect(empty).toEqual({ enqueued: 0, hasMore: false })
    expect(emptyAdmissionCounts).toEqual([0, 0])
  })
})
