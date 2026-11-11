import { randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import { emulatorS3 } from '@voucha/test-helpers/aws-emulator-s3'
import { generateStaticPagesSitemap } from '../static-pages.mts'
import { applyStoragePrefix } from '../storage-prefix.mts'

async function readPublishedStaticSitemap() {
  const object = await emulatorS3().send(
    new GetObjectCommand({
      Bucket: S3Buckets.sitemaps,
      Key: applyStoragePrefix('sitemaps/static.xml'),
    }),
  )
  return {
    contentType: object.ContentType,
    contentEncoding: object.ContentEncoding,
    xml: gunzipSync(await object.Body!.transformToByteArray()).toString(),
  }
}

describe('static pages sitemap', () => {
  beforeEach(() => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
    vi.stubEnv('SITEMAP_S3_PREFIX', `static-pages-${randomUUID()}`)
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
    await generateStaticPagesSitemap()
    const { xml } = await readPublishedStaticSitemap()
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap(match =>
      match[1] === undefined ? [] : [match[1]],
    )
    const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].flatMap(match =>
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

    const published = await readPublishedStaticSitemap()
    expect(published).toMatchObject({
      contentType: 'application/xml; charset=utf-8',
      contentEncoding: 'gzip',
    })
    expect(published.xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(published.xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(published.xml).toContain('</urlset>')
  })
})
