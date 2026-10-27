import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateStaticPagesSitemap } from '../static-pages.mts'

let uploadedXml = ''

describe('static pages sitemap', () => {
  const putSitemapObjectFile = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
    uploadedXml = ''
    putSitemapObjectFile.mockReset()
    putSitemapObjectFile.mockImplementation(async (_key: string, filePath: string) => {
      uploadedXml = gunzipSync(await readFile(filePath)).toString()
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('publishes each public static path once', async () => {
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
    await generateStaticPagesSitemap({ putSitemapObjectFile })
    const locs = [...uploadedXml.matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap(match =>
      match[1] === undefined ? [] : [match[1]],
    )
    const lastmods = [...uploadedXml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].flatMap(match =>
      match[1] === undefined ? [] : [match[1]],
    )
    expect(locs.toSorted()).toEqual(expectedPaths.map(path => `https://test.com${path}`).toSorted())
    expect(lastmods).toHaveLength(expectedPaths.length)
    for (const lastmod of lastmods) {
      expect(new Date(lastmod).toISOString()).toBe(lastmod)
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
