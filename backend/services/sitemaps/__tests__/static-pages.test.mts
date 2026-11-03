import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { buffer } from 'node:stream/consumers'
import type { Readable } from 'node:stream'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { generateStaticPagesSitemap } from '../static-pages.mts'

let uploadedXml = ''
let uploads: Array<{
  key: string | undefined
  bucket: string | undefined
  contentType: string | undefined
  contentEncoding: string | undefined
}> = []

describe('static pages sitemap', () => {
  beforeEach(() => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
    vi.stubEnv('SITEMAP_S3_PREFIX', '')
    uploadedXml = ''
    uploads = []
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(async command => {
      if (!(command instanceof PutObjectCommand)) throw new Error('Unexpected S3 command')
      const input = command.input
      uploads.push({
        key: input.Key,
        bucket: input.Bucket,
        contentType: input.ContentType,
        contentEncoding: input.ContentEncoding,
      })
      uploadedXml = gunzipSync(await buffer(input.Body as Readable)).toString()
      return {} as never
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    await generateStaticPagesSitemap()
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
    await generateStaticPagesSitemap()

    expect(uploads).toEqual([
      {
        key: 'sitemaps/static.xml',
        bucket: S3Buckets.sitemaps,
        contentType: 'application/xml; charset=utf-8',
        contentEncoding: 'gzip',
      },
    ])

    expect(uploadedXml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(uploadedXml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(uploadedXml).toContain('</urlset>')
  })
})
