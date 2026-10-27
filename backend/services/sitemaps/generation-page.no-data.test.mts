import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateSitemapPage, type GenerationPageDependencies } from './generation-page.mts'
import type { SitemapGenerationProgress } from './generation-storage.mts'
import type { PostDayManifest } from './storage.mts'
import type { SitemapFamilyEntry } from './types.mts'

describe('bounded sitemap publication', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('keeps the previous index live across a cap and a failed staged upload', async () => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
    const entries: SitemapFamilyEntry[] = [
      {
        id: '0199a000-0000-7000-8000-000000000003',
        path: '/first',
        updated_at: new Date('2026-04-01'),
      },
      {
        id: '0199a000-0000-7000-8000-000000000002',
        path: '/second',
        updated_at: new Date('2026-04-01'),
      },
    ]
    let progress: SitemapGenerationProgress | null = null
    const currentProgress = (): SitemapGenerationProgress | null => progress
    let manifest: PostDayManifest | null = {
      active_page_count: 1,
      generation_id: '11111111-1111-4111-8111-111111111111',
      generated_at: '2026-03-01T00:00:00.000Z',
      content_hash: 'previous-content',
    }
    const objects = new Map<string, string>([['sitemaps/families/topics.xml', 'previous-index']])
    const retired: Array<{ generationId: string; pageCount: number }> = []
    let failNextPage = true
    const dependencies: GenerationPageDependencies<SitemapFamilyEntry> = {
      getProgress: async () => progress,
      getManifest: async () => manifest,
      putProgress: async value => {
        progress = value
      },
      deleteProgress: async () => {
        progress = null
      },
      readPage: async options => {
        const eligible = entries.filter(
          entry =>
            (!options.highWaterId || entry.id <= options.highWaterId) &&
            (!options.afterId ||
              entry.id < options.afterId ||
              (entry.id === options.afterId && entry.path > (options.afterPath ?? ''))),
        )
        return eligible.slice(0, options.limit)
      },
      pageStorageKey: (generationId, page) => `families/topics/${generationId}/${page}.xml`,
      pageRoutePath: (generationId, page) => `sitemaps/topics/${generationId}/${page}.xml`,
      indexStorageKey: 'sitemaps/families/topics.xml',
      retireGeneration: async (generationId, pageCount) => {
        retired.push({ generationId, pageCount })
      },
      toUrl: entry => ({
        loc: `https://test.com${entry.path}`,
        lastmod: entry.updated_at.toISOString(),
      }),
      putObjectFile: async (key, filePath, options) => {
        if (options.manifest) manifest = options.manifest
        if (key.endsWith('/2.xml') && failNextPage) throw new Error('staged upload failed')
        objects.set(key, gunzipSync(await readFile(filePath)).toString())
      },
    }

    const first = await generateSitemapPage(1, dependencies)
    expect(first).toMatchObject({ manifest: null, hasMore: true })
    expect(objects.get('sitemaps/families/topics.xml')).toBe('previous-index')
    expect(manifest?.generation_id).toBe('11111111-1111-4111-8111-111111111111')
    const stagedGenerationId = currentProgress()?.generation_id

    await expect(generateSitemapPage(1, dependencies)).rejects.toThrow('staged upload failed')
    expect(objects.get('sitemaps/families/topics.xml')).toBe('previous-index')
    expect(currentProgress()?.page_count).toBe(1)

    failNextPage = false
    const final = await generateSitemapPage(1, dependencies)
    expect(final).toMatchObject({ hasMore: false, manifest: { active_page_count: 2 } })
    expect(objects.get('sitemaps/families/topics.xml')).toContain(
      `https://test.com/sitemaps/topics/${stagedGenerationId}/2.xml`,
    )
    expect(progress).toBeNull()

    const publishedIndex = objects.get('sitemaps/families/topics.xml')
    const repaged = await generateSitemapPage(2, dependencies)
    expect(repaged.manifest).toEqual(final.manifest)
    expect(objects.get('sitemaps/families/topics.xml')).toBe(publishedIndex)
    expect(retired.at(-1)?.pageCount).toBe(1)
    expect(retired.at(-1)?.generationId).not.toBe(final.manifest?.generation_id)
  })
})
