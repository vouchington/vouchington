import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createTestUser, getRssFeedTypeForTest, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { FeedClassification } from '../validate.mts'
import { createSourceFromUrl } from '../create-source.mts'
import { generateSourceDetails } from '../create-source-helpers.mts'

let user: PrivateUser

describe('generateSourceDetails', () => {
  it('appends random hex suffix to slug on retry attempt', () => {
    const result = generateSourceDetails(
      'My Feed (https://example.com/feed.xml)',
      'My Feed',
      'https://example.com/feed.xml',
      1,
    )
    expect(result.name).toBe('My Feed (https://example.com/feed.xml)')
    expect(result.slug).toMatch(/^my-feed-example-com-feed-xml-[0-9a-f]{4}$/)
  })
})

describe('create-source', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('createSourceFromUrl', () => {
    it('creates a new source topic and rss_feed for a valid URL', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (rssFeedUrl: string): Promise<FeedClassification> => {
          expect(rssFeedUrl).toBe(`https://create-source-${random}.example.com/feed.xml`)
          return { kind: 'feed', title: `Mock Feed ${random}`, feedType: 'article' }
        },
      )

      const result = await createSourceFromUrl(
        WEB_PROVENANCE,
        user,
        `https://create-source-${random}.example.com/feed.xml`,
        { fetchAndClassifyFeedImpl },
      )

      expect(result.status).toBe('created')
      expect(result.rss_feed_id).toBeDefined()
      expect(result.topic_id).toBeDefined()
      expect(result.topic_slug).toBeDefined()
      expect(result.topic_slug).toContain('create-source')
    })

    it('returns upvoted status for a duplicate URL submission', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const feedUrl = `https://dup-source-${random}.example.com/feed.xml`
      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (): Promise<FeedClassification> => ({
          kind: 'feed',
          title: `Dup Feed ${random}`,
          feedType: 'article',
        }),
      )

      const first = await createSourceFromUrl(WEB_PROVENANCE, user, feedUrl, {
        fetchAndClassifyFeedImpl,
      })
      expect(first.status).toBe('created')

      const second = await createSourceFromUrl(WEB_PROVENANCE, user, feedUrl, {
        fetchAndClassifyFeedImpl,
      })
      expect(second.status).toBe('upvoted')
      expect(second.rss_feed_id).toBe(first.rss_feed_id)
      expect(second.topic_id).toBe(first.topic_id)
    })

    it('retries source creation with a suffixed slug after a slug collision', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const title = `Retry Feed ${random}`
      const fetchAndClassifyFeedImpl = vi
        .fn<(rssFeedUrl: string) => Promise<FeedClassification>>()
        .mockResolvedValue({ kind: 'feed', title, feedType: 'article' })

      const first = await createSourceFromUrl(
        WEB_PROVENANCE,
        user,
        `https://slug-collision-${random}.example.com/feed.a`,
        { fetchAndClassifyFeedImpl },
      )
      const second = await createSourceFromUrl(
        WEB_PROVENANCE,
        user,
        `https://slug-collision-${random}.example.com/feed/a`,
        { fetchAndClassifyFeedImpl },
      )

      expect(second.status).toBe('created')
      expect(second.topic_id).not.toBe(first.topic_id)
      expect(second.topic_slug).toMatch(new RegExp(`^${first.topic_slug}-[0-9a-f]{4}$`))
    })

    it('uses the normalized feed hostname when a feed has no title', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const feedUrl = `http://Untitled-Source-${random}.Example.COM/feed.xml`
      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (): Promise<FeedClassification> => ({
          kind: 'feed',
          title: null,
          feedType: 'article',
        }),
      )

      const result = await createSourceFromUrl(WEB_PROVENANCE, user, feedUrl, {
        fetchAndClassifyFeedImpl,
      })

      expect(result.status).toBe('created')
      expect(result.topic_slug).toContain(`untitled-source-${random}`)
      expect(result.topic_slug).not.toContain('http')
    })

    it('throws 422 for an invalid URL', async () => {
      await expect(createSourceFromUrl(WEB_PROVENANCE, user, 'not-a-url')).rejects.toMatchObject({
        status: 422,
      })
    })

    it('throws 422 for a URL fragment', async () => {
      await expect(
        createSourceFromUrl(WEB_PROVENANCE, user, 'https://example.com/feed.xml#section'),
      ).rejects.toMatchObject({
        status: 422,
      })
    })

    it('throws 422 for non-public feed URL hostnames', async () => {
      await expect(
        createSourceFromUrl(WEB_PROVENANCE, user, 'https://localhost/feed.xml'),
      ).rejects.toMatchObject({
        status: 422,
        message: 'rss_feed_url must be a valid URL',
      })
    })

    it('prefers https when http:// input and https probe succeeds', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const httpUrl = `http://http-to-https-${random}.example.com/feed.xml`
      const httpsUrl = `https://http-to-https-${random}.example.com/feed.xml`

      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (rssFeedUrl: string): Promise<FeedClassification> => {
          expect(rssFeedUrl).toBe(httpsUrl)
          return {
            kind: 'feed',
            title: `HTTPS Feed ${random}`,
            feedType: 'article',
          }
        },
      )

      const result = await createSourceFromUrl(WEB_PROVENANCE, user, httpUrl, {
        fetchAndClassifyFeedImpl,
      })

      expect(result.status).toBe('created')
      expect(result.topic_slug).toContain(`http-to-https-${random}`)
      expect(fetchAndClassifyFeedImpl).toHaveBeenCalledWith(httpsUrl)
    })

    it('falls back to http when http:// input and https probe fails', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const httpUrl = `http://http-fallback-${random}.example.com/feed.xml`
      const httpsUrl = `https://http-fallback-${random}.example.com/feed.xml`
      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (rssFeedUrl: string): Promise<FeedClassification> => {
          if (rssFeedUrl === httpsUrl) {
            throw new Error('HTTPS connection refused')
          }
          expect(rssFeedUrl).toBe(httpUrl)
          return {
            kind: 'feed',
            title: `HTTP Fallback Feed ${random}`,
            feedType: 'article',
          }
        },
      )

      const result = await createSourceFromUrl(WEB_PROVENANCE, user, httpUrl, {
        fetchAndClassifyFeedImpl,
      })

      expect(result.status).toBe('created')
      expect(result.topic_slug).toContain(`http-fallback-${random}`)
      expect(fetchAndClassifyFeedImpl).toHaveBeenCalledWith(httpsUrl)
      expect(fetchAndClassifyFeedImpl).toHaveBeenCalledWith(httpUrl)
    })

    it('falls back to http when https probe redirects to http (server does not support https)', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const httpUrl = `http://https-to-http-redirect-${random}.example.com/feed.xml`
      const httpsUrl = `https://https-to-http-redirect-${random}.example.com/feed.xml`
      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (rssFeedUrl: string): Promise<FeedClassification> => {
          if (rssFeedUrl === httpsUrl) {
            return {
              kind: 'redirect',
              location: httpUrl,
              isPermanent: false,
            }
          }
          expect(rssFeedUrl).toBe(httpUrl)
          return {
            kind: 'feed',
            title: `HTTP Only Feed ${random}`,
            feedType: 'article',
          }
        },
      )

      const result = await createSourceFromUrl(WEB_PROVENANCE, user, httpUrl, {
        fetchAndClassifyFeedImpl,
      })

      expect(result.status).toBe('created')
      expect(result.topic_slug).toContain(`https-to-http-redirect-${random}`)
    })

    it('upvotes existing https feed when http:// input has matching https feed', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const httpsUrl = `https://existing-https-${random}.example.com/feed.xml`
      const httpUrl = `http://existing-https-${random}.example.com/feed.xml`
      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (rssFeedUrl: string): Promise<FeedClassification> => {
          expect(rssFeedUrl).toBe(httpsUrl)
          return {
            kind: 'feed',
            title: `Existing HTTPS Feed ${random}`,
            feedType: 'article',
          }
        },
      )

      const first = await createSourceFromUrl(WEB_PROVENANCE, user, httpsUrl, {
        fetchAndClassifyFeedImpl,
      })
      expect(first.status).toBe('created')

      const second = await createSourceFromUrl(WEB_PROVENANCE, user, httpUrl, {
        fetchAndClassifyFeedImpl,
      })
      expect(second.status).toBe('upvoted')
      expect(second.rss_feed_id).toBe(first.rss_feed_id)
      expect(second.topic_id).toBe(first.topic_id)
    })

    it('persists the classified feed_type to rss_feeds on creation', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (): Promise<FeedClassification> => ({
          kind: 'feed',
          title: `Podcast Feed ${random}`,
          feedType: 'podcast',
        }),
      )

      const result = await createSourceFromUrl(
        WEB_PROVENANCE,
        user,
        `https://podcast-feed-type-${random}.example.com/feed.xml`,
        { fetchAndClassifyFeedImpl },
      )

      expect(result.status).toBe('created')
      expect(await getRssFeedTypeForTest(result.rss_feed_id)).toBe('podcast')
    })
  })
})
