import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { createSitemapsHandlers } from './workers.mts'

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

/** Runs the handler registered under a local job name with the job's data. */
function run(
  processors: ReturnType<typeof makeProcessors>,
  localName: string,
  data: Record<string, unknown> = {},
) {
  const handler = createSitemapsHandlers(processors).find(
    candidate => candidate.job.name === `sitemaps.${localName}`,
  )
  if (!handler) throw new Error(`No sitemaps handler for ${localName}`)
  return handler.handle({ data } as Job<never>)
}

describe('sitemaps handler routing', () => {
  it('registers one handler for every sitemaps job', () => {
    expect(
      createSitemapsHandlers(makeProcessors())
        .map(handler => handler.job.name)
        .toSorted(),
    ).toEqual([
      'sitemaps.processMonthlyBackfillArchiveDispatcher',
      'sitemaps.processNightlyBackfillWeekDispatcher',
      'sitemaps.processUpdateFamilySitemap',
      'sitemaps.processUpdatePostDaySitemap',
      'sitemaps.processUpdatePostTypeIndex',
      'sitemaps.processUpdatePostsIndex',
      'sitemaps.processUpdateRootIndex',
      'sitemaps.processWeeklyBackfillMonthDispatcher',
    ])
  })

  it('routes post-day jobs through validated post type and day data', async () => {
    const processors = makeProcessors()

    await run(processors, 'processUpdatePostDaySitemap', {
      postType: 'discussion',
      day: '2026-06-10',
    })

    expect(processors.processUpdatePostDaySitemap).toHaveBeenCalledWith({
      postType: 'discussion',
      day: '2026-06-10',
    })
  })

  it('routes index jobs through validated data', async () => {
    const processors = makeProcessors()

    await run(processors, 'processUpdateFamilySitemap', { family: 'landing-pages' })
    await run(processors, 'processUpdatePostTypeIndex', { postType: 'review' })
    await run(processors, 'processUpdatePostsIndex')
    await run(processors, 'processUpdateRootIndex')

    expect(processors.processUpdateFamilySitemap).toHaveBeenCalledWith('landing-pages')
    expect(processors.processUpdatePostTypeIndex).toHaveBeenCalledWith('review')
    expect(processors.processUpdatePostsIndex).toHaveBeenCalledWith()
    expect(processors.processUpdateRootIndex).toHaveBeenCalledWith()
  })

  it('routes dispatcher jobs and hands the archive dispatcher its cursor', async () => {
    const processors = makeProcessors()

    await run(processors, 'processNightlyBackfillWeekDispatcher')
    await run(processors, 'processWeeklyBackfillMonthDispatcher')
    await run(processors, 'processMonthlyBackfillArchiveDispatcher', { afterDay: '2026-01-31' })
    await run(processors, 'processMonthlyBackfillArchiveDispatcher')

    expect(processors.processNightlyBackfillWeekDispatcher).toHaveBeenCalledWith()
    expect(processors.processWeeklyBackfillMonthDispatcher).toHaveBeenCalledWith()
    expect(processors.processMonthlyBackfillArchiveDispatcher).toHaveBeenNthCalledWith(
      1,
      '2026-01-31',
    )
    expect(processors.processMonthlyBackfillArchiveDispatcher).toHaveBeenNthCalledWith(2, undefined)
  })

  it('rejects malformed job data before processing', () => {
    const processors = makeProcessors()

    expect(() => run(processors, 'processUpdatePostDaySitemap', { postType: 'unknown' })).toThrow(
      'Unsupported postType: unknown',
    )
    expect(() => run(processors, 'processUpdateFamilySitemap', {})).toThrow('family is required')
    expect(processors.processUpdatePostDaySitemap).not.toHaveBeenCalled()
  })
})
