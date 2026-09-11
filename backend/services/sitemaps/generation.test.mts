import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generatePostTypeIndex,
  generateRootIndex,
  indexGenerationDependencies,
} from './generation.mts'
import { buildPostTypeIndexEntries, buildRootIndexEntries } from './index-entries.mts'
import type { PostDayManifest } from './storage.mts'

const manifest: PostDayManifest = {
  active_page_count: 1,
  highest_written_page: 1,
  generated_at: '2026-06-10T00:00:00.000Z',
  content_hashes: { 'index.xml': 'hash' },
}

describe('sitemap index generation entries', () => {
  beforeEach(() => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://example.com')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('only links post-day indexes that have a manifest', async () => {
    const getManifest = vi.fn<VitestLooseMock>().mockImplementation(async (_postType, day) => {
      return day === '2026-06-10' ? manifest : null
    })

    await expect(
      buildPostTypeIndexEntries('article', ['2026-06-09', '2026-06-10'], getManifest),
    ).resolves.toEqual([{ loc: 'https://example.com/sitemaps/article/2026-06-10/index.xml' }])
  })

  it('bounds post-day manifest lookups for large tracked ranges', async () => {
    let activeLookups = 0
    let maxActiveLookups = 0
    const getManifest = vi.fn<VitestLooseMock>().mockImplementation(async () => {
      activeLookups += 1
      maxActiveLookups = Math.max(maxActiveLookups, activeLookups)
      await new Promise<void>(resolve => setImmediate(resolve))
      activeLookups -= 1
      return null
    })

    await buildPostTypeIndexEntries(
      'article',
      Array.from({ length: 40 }, (_, index) => `2026-06-${String(index + 1).padStart(2, '0')}`),
      getManifest,
    )

    expect(maxActiveLookups).toBeLessThanOrEqual(16)
  })

  it('only links family indexes that have a manifest', async () => {
    const getFamilyManifest = vi.fn<VitestLooseMock>().mockImplementation(async family => {
      return family === 'topics' ? manifest : null
    })

    await expect(buildRootIndexEntries(getFamilyManifest)).resolves.toEqual([
      { loc: 'https://example.com/sitemaps/static.xml' },
      { loc: 'https://example.com/sitemaps/posts.xml' },
      { loc: 'https://example.com/sitemaps/topics.xml' },
    ])
  })

  it('writes post type indexes from manifest-backed entries', async () => {
    const dependencies = {
      ...indexGenerationDependencies,
      buildPostTypeIndexEntries: vi.fn<VitestLooseMock>().mockResolvedValue([{ loc: 'one' }]),
      createGzipFileFromUtf8Chunks: vi
        .fn<VitestLooseMock>()
        .mockResolvedValue({ filePath: '/tmp/type.xml.gz', contentHash: 'hash' }),
      deleteTemporaryGzipFile: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      getTrackedDayRange: vi
        .fn<VitestLooseMock>()
        .mockResolvedValue({ earliestDay: '2026-06-09', latestDay: '2026-06-10' }),
      putSitemapObjectFile: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    }

    await generatePostTypeIndex('article', dependencies)

    expect(dependencies.buildPostTypeIndexEntries).toHaveBeenCalledWith('article', [
      '2026-06-09',
      '2026-06-10',
    ])
    expect(dependencies.putSitemapObjectFile).toHaveBeenCalledWith(
      'sitemaps/types/article.xml',
      '/tmp/type.xml.gz',
      { contentEncoding: 'gzip', contentType: 'application/xml; charset=utf-8' },
    )
    expect(dependencies.deleteTemporaryGzipFile).toHaveBeenCalledWith('/tmp/type.xml.gz')
  })

  it('writes root indexes after generating static pages and manifest-backed entries', async () => {
    const dependencies = {
      ...indexGenerationDependencies,
      buildRootIndexEntries: vi.fn<VitestLooseMock>().mockResolvedValue([{ loc: 'root' }]),
      createGzipFileFromUtf8Chunks: vi
        .fn<VitestLooseMock>()
        .mockResolvedValue({ filePath: '/tmp/root.xml.gz', contentHash: 'hash' }),
      deleteTemporaryGzipFile: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      generateStaticPagesSitemap: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      putSitemapObjectFile: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    }

    await generateRootIndex(dependencies)

    expect(dependencies.generateStaticPagesSitemap).toHaveBeenCalledWith()
    expect(dependencies.buildRootIndexEntries).toHaveBeenCalledWith()
    expect(dependencies.putSitemapObjectFile).toHaveBeenCalledWith(
      'sitemaps/root.xml',
      '/tmp/root.xml.gz',
      { contentEncoding: 'gzip', contentType: 'application/xml; charset=utf-8' },
    )
    expect(dependencies.deleteTemporaryGzipFile).toHaveBeenCalledWith('/tmp/root.xml.gz')
  })
})
