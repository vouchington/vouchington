import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gunzipUtf8 } from './gzip.mts'
import { buildSitemapFamilyIndexEntry, generateSitemapFamilyFiles } from './family-generation.mts'

async function* familyEntries() {
  yield { path: '/@testuser', updated_at: new Date('2026-04-01T00:00:00.000Z') }
  yield { path: '/@testuser/gear', updated_at: new Date('2026-04-02T00:00:00.000Z') }
}

describe('family sitemap generation', () => {
  const getSitemapFamilyManifest = vi.fn<VitestLooseMock>()
  const iterateSitemapFamilyEntries = vi.fn<VitestLooseMock>()
  const putSitemapFamilyManifest = vi.fn<VitestLooseMock>()
  const putSitemapObjectFile = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
    getSitemapFamilyManifest.mockReset()
    iterateSitemapFamilyEntries.mockReset()
    putSitemapFamilyManifest.mockReset()
    putSitemapObjectFile.mockReset()
    getSitemapFamilyManifest.mockResolvedValue(null)
    iterateSitemapFamilyEntries.mockReturnValue(familyEntries())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('writes family page, index, and manifest files', async () => {
    const uploadedXml = new Map<string, string>()
    putSitemapObjectFile.mockImplementation(async (key: string, filePath: string) => {
      uploadedXml.set(key, await gunzipUtf8(await readFile(filePath)))
    })

    const manifest = await generateSitemapFamilyFiles('landing-pages', {
      getSitemapFamilyManifest,
      iterateSitemapFamilyEntries,
      putSitemapFamilyManifest,
      putSitemapObjectFile,
    })

    expect(manifest.active_page_count).toBe(1)
    expect(manifest.highest_written_page).toBe(1)
    expect(putSitemapObjectFile).toHaveBeenCalledTimes(2)
    expect(uploadedXml.get('families/landing-pages/1.xml')).toContain(
      '<loc>https://test.com/@testuser/gear</loc>',
    )
    expect(uploadedXml.get('sitemaps/families/landing-pages.xml')).toContain(
      '<loc>https://test.com/sitemaps/landing-pages/1.xml</loc>',
    )
    expect(putSitemapFamilyManifest).toHaveBeenCalledWith(
      'landing-pages',
      expect.objectContaining({
        active_page_count: 1,
        highest_written_page: 1,
        content_hashes: expect.objectContaining({
          '1.xml': expect.any(String),
          'index.xml': expect.any(String),
        }),
      }),
    )
  })

  it('rewrites stale family pages when the active page count shrinks', async () => {
    const uploadedXml = new Map<string, string>()
    putSitemapObjectFile.mockImplementation(async (key: string, filePath: string) => {
      uploadedXml.set(key, await gunzipUtf8(await readFile(filePath)))
    })
    getSitemapFamilyManifest.mockResolvedValue({
      active_page_count: 3,
      highest_written_page: 3,
      generated_at: '2026-03-01T00:00:00.000Z',
      content_hashes: {
        '1.xml': 'old-page-hash',
        '2.xml': 'old-stale-page-hash',
        '3.xml': 'old-stale-page-hash',
        'index.xml': 'old-index-hash',
      },
    })
    iterateSitemapFamilyEntries.mockReturnValue(iterateSingleTopicEntry())

    const manifest = await generateSitemapFamilyFiles('topics', {
      getSitemapFamilyManifest,
      iterateSitemapFamilyEntries,
      putSitemapFamilyManifest,
      putSitemapObjectFile,
    })

    expect(manifest.active_page_count).toBe(1)

    async function* iterateSingleTopicEntry() {
      yield { path: '/topics/test/posts', updated_at: new Date('2026-04-01T00:00:00.000Z') }
    }
    expect(manifest.highest_written_page).toBe(3)
    expect(uploadedXml.get('families/topics/2.xml')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
    )
    expect(uploadedXml.get('families/topics/3.xml')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
    )
    expect(putSitemapFamilyManifest).toHaveBeenCalledWith(
      'topics',
      expect.objectContaining({
        active_page_count: 1,
        highest_written_page: 3,
        content_hashes: expect.objectContaining({
          '2.xml': expect.any(String),
          '3.xml': expect.any(String),
        }),
      }),
    )
  })

  it('closes the family entry iterator when page publication fails', async () => {
    const returnIterator = vi.fn<VitestLooseMock>().mockResolvedValue({ done: true })
    const iterator = {
      next: vi
        .fn<VitestLooseMock>()
        .mockResolvedValueOnce({
          done: false,
          value: {
            path: '/topics/test/posts',
            updated_at: new Date('2026-04-01T00:00:00.000Z'),
          },
        })
        .mockResolvedValue({ done: true }),
      return: returnIterator,
      [Symbol.asyncIterator]() {
        return this
      },
    }
    iterateSitemapFamilyEntries.mockReturnValue(iterator)
    putSitemapObjectFile.mockRejectedValueOnce(new Error('upload failed'))

    await expect(
      generateSitemapFamilyFiles('topics', {
        getSitemapFamilyManifest,
        iterateSitemapFamilyEntries,
        putSitemapFamilyManifest,
        putSitemapObjectFile,
      }),
    ).rejects.toThrow('upload failed')

    expect(returnIterator).toHaveBeenCalledOnce()
  })

  it('builds root-index entries for family indexes', () => {
    expect(buildSitemapFamilyIndexEntry('domains')).toEqual({
      loc: 'https://test.com/sitemaps/domains.xml',
    })
  })
})
