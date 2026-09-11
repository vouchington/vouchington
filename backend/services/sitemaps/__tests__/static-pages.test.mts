import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gunzipUtf8 } from '../gzip.mts'
import {
  STATIC_PAGE_PATHS,
  buildStaticPageUrlEntries,
  generateStaticPagesSitemap,
} from '../static-pages.mts'

let uploadedXml = ''

describe('static pages sitemap', () => {
  const putSitemapObjectFile = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
    uploadedXml = ''
    putSitemapObjectFile.mockReset()
    putSitemapObjectFile.mockImplementation(async (_key: string, filePath: string) => {
      uploadedXml = await gunzipUtf8(await readFile(filePath))
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds static page url entries for the expected public paths', () => {
    const expectedPaths = [
      '/',
      '/news',
      '/stories',
      '/plans',
      '/articles',
      '/blog',
      '/channels',
      '/communities',
      '/topics',
      '/cards',
      '/domains',
      '/domains/compare',
      '/sources',
      '/news-sources',
      '/web-search',
      '/reviews',
      '/discussions',
      '/posts',
      '/podcasts',
      '/podcast-episodes',
      '/data-points',
      '/referral-programs',
      '/rewards-programs',
      '/spending-categories',
      '/rewards-program-statuses',
      '/videos',
    ]
    expect(STATIC_PAGE_PATHS).toHaveLength(expectedPaths.length)
    expect(STATIC_PAGE_PATHS.toSorted()).toEqual(expectedPaths.toSorted())

    const lastmod = '2026-03-08T08:00:00.000Z'
    const entries = buildStaticPageUrlEntries(lastmod)
    expect(entries).toHaveLength(expectedPaths.length)
    expect(entries).toContainEqual({ loc: 'https://test.com/', lastmod })
    expect(entries).toContainEqual({ loc: 'https://test.com/news', lastmod })
    expect(entries).toContainEqual({ loc: 'https://test.com/stories', lastmod })
    for (const entry of entries) {
      expect(entry.lastmod).toBe(lastmod)
      expect(entry.loc).toMatch(/^https:\/\/test\.com\//)
    }
  })

  it('writes a gzip urlset sitemap containing the static pages', async () => {
    await generateStaticPagesSitemap({ putSitemapObjectFile })

    expect(putSitemapObjectFile).toHaveBeenCalledTimes(1)
    const [key, _filePath, options] = putSitemapObjectFile.mock.calls[0] as [
      string,
      string,
      { contentType: string; contentEncoding?: string },
    ]

    expect(key).toBe('sitemaps/static.xml')
    expect(options).toEqual({
      contentType: 'application/xml; charset=utf-8',
      contentEncoding: 'gzip',
    })

    expect(uploadedXml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(uploadedXml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(uploadedXml).toContain('<loc>https://test.com/</loc>')
    expect(uploadedXml).toContain('<loc>https://test.com/news</loc>')
    expect(uploadedXml).toContain('<loc>https://test.com/stories</loc>')
    expect(uploadedXml).toContain('<loc>https://test.com/communities</loc>')
    expect(uploadedXml).toContain('<loc>https://test.com/channels</loc>')
    expect(uploadedXml).toContain('<loc>https://test.com/podcasts</loc>')
    expect(uploadedXml).toContain('<loc>https://test.com/videos</loc>')
    expect(uploadedXml).toContain('<loc>https://test.com/rewards-program-statuses</loc>')
    expect(uploadedXml).toContain('</urlset>')
  })
})
