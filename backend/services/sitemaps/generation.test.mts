import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePostTypeIndex, generateRootIndex } from './generation.mts'
import { spyOnSitemapObjectStore } from '@voucha/test-helpers/sitemap-object-store'
import { buildPostTypeIndexEntries, buildRootIndexEntries } from './index-entries.mts'
import type { PostDayManifest } from './storage.mts'

const manifest: PostDayManifest = {
  active_page_count: 1,
  generation_id: '11111111-1111-4111-8111-111111111111',
  content_hash: 'previous-content',
  generated_at: '2026-06-10T00:00:00.000Z',
}

describe('sitemap index generation entries', () => {
  beforeEach(() => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://example.com')
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    const capReached = Promise.withResolvers<void>()
    const releaseLookups = Promise.withResolvers<void>()
    const getManifest = vi.fn<VitestLooseMock>().mockImplementation(async () => {
      activeLookups += 1
      maxActiveLookups = Math.max(maxActiveLookups, activeLookups)
      if (activeLookups === 16) capReached.resolve()
      await releaseLookups.promise
      activeLookups -= 1
      return null
    })

    const building = buildPostTypeIndexEntries(
      'article',
      Array.from({ length: 40 }, (_, index) => `2026-06-${String(index + 1).padStart(2, '0')}`),
      getManifest,
    )
    await capReached.promise
    expect(activeLookups).toBe(16)
    expect(maxActiveLookups).toBe(16)
    releaseLookups.resolve()
    await building
    expect(maxActiveLookups).toBe(16)
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

  it('writes a compressed post type index from the tracked range and published manifests', async () => {
    const objects = new Map<string, Buffer>([
      [
        'sitemaps/meta/posts-tracked-range.json',
        Buffer.from(JSON.stringify({ earliestDay: '2026-06-09', latestDay: '2026-06-10' })),
      ],
    ])
    const metadata = new Map([['posts/2026/06/10/article/index.xml', manifest]])
    spyOnSitemapObjectStore(objects, () => undefined, metadata)

    await generatePostTypeIndex('article')

    const compressed = objects.get('sitemaps/types/article.xml')
    expect(compressed).toBeDefined()
    const xml = gunzipSync(compressed!).toString()
    expect(xml).toContain('https://example.com/sitemaps/article/2026-06-10/index.xml')
    expect(xml).not.toContain('2026-06-09')
  })

  it('writes compressed static and root indexes with published family links', async () => {
    const objects = new Map<string, Buffer>()
    const metadata = new Map([['sitemaps/families/topics.xml', manifest]])
    spyOnSitemapObjectStore(objects, () => undefined, metadata)

    await generateRootIndex()

    const staticIndex = objects.get('sitemaps/static.xml')
    const rootIndex = objects.get('sitemaps/root.xml')
    expect(staticIndex).toBeDefined()
    expect(rootIndex).toBeDefined()
    expect(gunzipSync(staticIndex!).toString()).toContain('https://example.com/news')
    const xml = gunzipSync(rootIndex!).toString()
    expect(xml).toContain('https://example.com/sitemaps/static.xml')
    expect(xml).toContain('https://example.com/sitemaps/posts.xml')
    expect(xml).toContain('https://example.com/sitemaps/topics.xml')
    expect(xml).not.toContain('https://example.com/sitemaps/users.xml')
  })
})
