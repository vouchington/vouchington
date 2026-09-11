import { afterAll, describe, expect, it, vi } from 'vitest'
import { processSitemapJob, sitemaps } from './workers.mts'
import type { Job } from 'glide-mq'

function makeJob(
  orderingKey: string,
  name: string,
  data: Record<string, unknown> = {},
): Job<Record<string, unknown>> {
  return { data, name, opts: { ordering: { key: orderingKey } } } as Job<Record<string, unknown>>
}

function makeProcessors() {
  return {
    processUpdatePostDaySitemap: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    processUpdatePostTypeIndex: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    processUpdatePostsIndex: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    processUpdateFamilySitemap: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    processUpdateRootIndex: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    processNightlyBackfillWeekDispatcher: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    processWeeklyBackfillMonthDispatcher: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    processMonthlyBackfillArchiveDispatcher: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  }
}

describe('sitemap worker routing', () => {
  afterAll(async () => {
    await sitemaps.close()
  })

  it('routes post-day jobs through validated post type and day data', async () => {
    const processors = makeProcessors()

    await processSitemapJob(
      makeJob('post_day_today', 'processUpdatePostDaySitemap', {
        postType: 'discussion',
        day: '2026-06-10',
      }),
      processors,
    )

    expect(processors.processUpdatePostDaySitemap).toHaveBeenCalledWith({
      postType: 'discussion',
      day: '2026-06-10',
    })
  })

  it('routes index jobs through validated data', async () => {
    const processors = makeProcessors()

    await processSitemapJob(
      makeJob('indexes', 'processUpdateFamilySitemap', { family: 'landing-pages' }),
      processors,
    )
    await processSitemapJob(
      makeJob('indexes', 'processUpdatePostTypeIndex', { postType: 'review' }),
      processors,
    )
    await processSitemapJob(makeJob('indexes', 'processUpdatePostsIndex'), processors)
    await processSitemapJob(makeJob('indexes', 'processUpdateRootIndex'), processors)

    expect(processors.processUpdateFamilySitemap).toHaveBeenCalledWith('landing-pages')
    expect(processors.processUpdatePostTypeIndex).toHaveBeenCalledWith('review')
    expect(processors.processUpdatePostsIndex).toHaveBeenCalledWith()
    expect(processors.processUpdateRootIndex).toHaveBeenCalledWith()
  })

  it('routes dispatcher jobs', async () => {
    const processors = makeProcessors()

    await processSitemapJob(
      makeJob('dispatcher', 'processNightlyBackfillWeekDispatcher'),
      processors,
    )
    await processSitemapJob(
      makeJob('dispatcher', 'processWeeklyBackfillMonthDispatcher'),
      processors,
    )
    await processSitemapJob(
      makeJob('dispatcher', 'processMonthlyBackfillArchiveDispatcher'),
      processors,
    )

    expect(processors.processNightlyBackfillWeekDispatcher).toHaveBeenCalledWith()
    expect(processors.processWeeklyBackfillMonthDispatcher).toHaveBeenCalledWith()
    expect(processors.processMonthlyBackfillArchiveDispatcher).toHaveBeenCalledWith()
  })

  it('throws for unsupported job names and ordering keys', () => {
    const processors = makeProcessors()

    expect(() => processSitemapJob(makeJob('post_day_today', 'unknown'), processors)).toThrow(
      'Sitemap post-day job unknown not found',
    )
    expect(() => processSitemapJob(makeJob('indexes', 'unknown'), processors)).toThrow(
      'Sitemap index job unknown not found',
    )
    expect(() => processSitemapJob(makeJob('dispatcher', 'unknown'), processors)).toThrow(
      'Sitemap dispatcher job unknown not found',
    )
    expect(() => processSitemapJob(makeJob('other', 'unknown'), processors)).toThrow(
      'Unknown ordering key: other',
    )
  })
})
