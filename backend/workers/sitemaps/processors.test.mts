import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import {
  processUpdateFamilySitemap,
  processNightlyBackfillWeekDispatcher,
  processUpdatePostDaySitemap,
  processUpdatePostTypeIndex,
  processUpdatePostsIndex,
  processUpdateRootIndex,
  updatePostDaySitemapDependencies,
  updateSitemapIndexDependencies,
  backfillDispatcherDependencies,
} from './processors.mts'
import {
  enqueueBulkUpdatePostDaySitemaps as realEnqueueBulkUpdatePostDaySitemaps,
  enqueueUpdateFamilySitemap as realEnqueueUpdateFamilySitemap,
} from '@queues/sitemaps/enqueues'
import type { PostDayManifest } from '@services/sitemaps/storage'

const manifest: PostDayManifest = {
  active_page_count: 1,
  highest_written_page: 1,
  generated_at: '2026-06-01T00:00:00.000Z',
  content_hashes: { 'index.xml': 'hash' },
}

describe('sitemap processors', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('generates a post-day sitemap before enqueueing all dependent index updates', async () => {
    const generateSpy = vi
      .spyOn(updatePostDaySitemapDependencies, 'generatePostDaySitemapFiles')
      .mockResolvedValue(manifest)
    const typeIndexSpy = vi
      .spyOn(updatePostDaySitemapDependencies, 'enqueueUpdatePostTypeIndex')
      .mockResolvedValue(undefined)
    const postsIndexSpy = vi
      .spyOn(updatePostDaySitemapDependencies, 'enqueueUpdatePostsIndex')
      .mockResolvedValue(undefined)
    const rootIndexSpy = vi
      .spyOn(updatePostDaySitemapDependencies, 'enqueueUpdateRootIndex')
      .mockResolvedValue(undefined)
    const invalidateSpy = vi
      .spyOn(updatePostDaySitemapDependencies, 'invalidateSitemaps')
      .mockResolvedValue(undefined)

    await processUpdatePostDaySitemap({ postType: 'review', day: '2026-06-01' })

    expect(generateSpy).toHaveBeenCalledWith('review', '2026-06-01')
    expect(invalidateSpy).toHaveBeenCalledWith()
    expect(typeIndexSpy).toHaveBeenCalledWith('review')
    expect(postsIndexSpy).toHaveBeenCalledWith()
    expect(rootIndexSpy).toHaveBeenCalledWith()
  })

  it('invalidates the sitemap tag after regenerating each sitemap index', async () => {
    const postTypeIndexSpy = vi
      .spyOn(updateSitemapIndexDependencies, 'generatePostTypeIndex')
      .mockResolvedValue(undefined)
    const postsIndexSpy = vi
      .spyOn(updateSitemapIndexDependencies, 'generatePostsIndex')
      .mockResolvedValue(undefined)
    const rootIndexSpy = vi
      .spyOn(updateSitemapIndexDependencies, 'generateRootIndex')
      .mockResolvedValue(undefined)
    const invalidateSpy = vi
      .spyOn(updateSitemapIndexDependencies, 'invalidateSitemaps')
      .mockResolvedValue(undefined)

    await processUpdatePostTypeIndex('review')
    await processUpdatePostsIndex()
    await processUpdateRootIndex()

    expect(postTypeIndexSpy).toHaveBeenCalledWith('review')
    expect(postsIndexSpy).toHaveBeenCalledWith()
    expect(rootIndexSpy).toHaveBeenCalledWith()
    expect(invalidateSpy).toHaveBeenCalledTimes(3)
  })

  it('regenerates a family sitemap, invalidates, and enqueues the root index', async () => {
    const familySpy = vi
      .spyOn(updateSitemapIndexDependencies, 'generateSitemapFamilyFiles')
      .mockResolvedValue(manifest)
    const rootIndexSpy = vi
      .spyOn(updateSitemapIndexDependencies, 'enqueueUpdateRootIndex')
      .mockResolvedValue(undefined)
    const invalidateSpy = vi
      .spyOn(updateSitemapIndexDependencies, 'invalidateSitemaps')
      .mockResolvedValue(undefined)

    await processUpdateFamilySitemap('topics')

    expect(familySpy).toHaveBeenCalledWith('topics')
    expect(invalidateSpy).toHaveBeenCalledWith()
    expect(rootIndexSpy).toHaveBeenCalledWith()
  })

  it('enqueues nightly post-day and family sitemap backfills', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-06-10T08:00:00.000Z'))
      const bulkSpy = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
      const familySpy = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)

      await processNightlyBackfillWeekDispatcher({
        enqueueBulkUpdatePostDaySitemaps: bulkSpy,
        enqueueUpdateFamilySitemap: familySpy,
      })

      const expectedDays = [
        '2026-06-04',
        '2026-06-05',
        '2026-06-06',
        '2026-06-07',
        '2026-06-08',
        '2026-06-09',
        '2026-06-10',
      ]
      const expectedPostDayEntries = SITEMAP_CONFIG.POST_TYPES.flatMap(postType =>
        expectedDays.map(day => ({ postType, day })),
      )
      expect(bulkSpy).toHaveBeenCalledWith(expectedPostDayEntries)
      expect(familySpy.mock.calls.map(([family]) => family)).toEqual([
        'users',
        'topics',
        'communities',
        'domains',
        'landing-pages',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('wires the default backfill dispatcher dependencies to the real queue enqueue functions', async () => {
    // Assert the bindings' identity against the real imported queue functions BEFORE
    // vi.spyOn replaces them below. Without this, the test would still pass even if
    // backfillDispatcherDependencies were wired to unrelated same-signature stand-ins,
    // since spying overwrites whatever is currently on the object regardless of what it was.
    expect(backfillDispatcherDependencies.enqueueBulkUpdatePostDaySitemaps).toBe(
      realEnqueueBulkUpdatePostDaySitemaps,
    )
    expect(backfillDispatcherDependencies.enqueueUpdateFamilySitemap).toBe(
      realEnqueueUpdateFamilySitemap,
    )

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-06-10T08:00:00.000Z'))
      const bulkSpy = vi
        .spyOn(backfillDispatcherDependencies, 'enqueueBulkUpdatePostDaySitemaps')
        .mockResolvedValue(undefined)
      const familySpy = vi
        .spyOn(backfillDispatcherDependencies, 'enqueueUpdateFamilySitemap')
        .mockResolvedValue(undefined)

      await processNightlyBackfillWeekDispatcher()

      expect(bulkSpy).toHaveBeenCalledTimes(1)
      expect(familySpy).toHaveBeenCalledTimes(SITEMAP_CONFIG.FAMILY_TYPES.length)
    } finally {
      vi.useRealTimers()
      // This is the last test in the file, so there is no following `beforeEach` to restore
      // these spies. The `backend-data-stores` Vitest project runs with `isolate: false`, so an
      // un-restored spy on the shared `backfillDispatcherDependencies` object would otherwise
      // leak into whatever unrelated test file next runs in the same worker fork.
      vi.restoreAllMocks()
    }
  })
})
