import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { FeedClassification } from '../validate.mts'

import { createSourceFromUrl } from '../create-source.mts'

let user: PrivateUser

describe('create-source.redirect', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('createSourceFromUrl redirect handling', () => {
    it('follows a permanent redirect and creates a feed at the canonical URL', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const originalUrl = `https://redir-perm-src-${random}.example.com/feed.xml`
      const canonicalUrl = `https://redir-perm-dst-${random}.example.com/feed.xml`
      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (rssFeedUrl: string): Promise<FeedClassification> => {
          if (rssFeedUrl === originalUrl) {
            return { kind: 'redirect', location: canonicalUrl, isPermanent: true }
          }
          expect(rssFeedUrl).toBe(canonicalUrl)
          return {
            kind: 'feed',
            title: `Redirected Feed ${random}`,
            feedType: 'article',
          }
        },
      )

      const result = await createSourceFromUrl(WEB_PROVENANCE, user, originalUrl, {
        fetchAndClassifyFeedImpl,
      })

      expect(result.status).toBe('created')
      expect(result.topic_slug).toContain('redir-perm-dst')
    })

    it('follows a temporary redirect and creates a feed at the redirect target, no canonical written', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const originalUrl = `https://redir-tmp-src-${random}.example.com/feed.xml`
      const targetUrl = `https://redir-tmp-dst-${random}.example.com/feed.xml`
      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (rssFeedUrl: string): Promise<FeedClassification> => {
          if (rssFeedUrl === originalUrl) {
            return { kind: 'redirect', location: targetUrl, isPermanent: false }
          }
          expect(rssFeedUrl).toBe(targetUrl)
          return {
            kind: 'feed',
            title: `Temp Redirected Feed ${random}`,
            feedType: 'article',
          }
        },
      )

      const result = await createSourceFromUrl(WEB_PROVENANCE, user, originalUrl, {
        fetchAndClassifyFeedImpl,
      })

      expect(result.status).toBe('created')
    })

    it('submitting the pre-redirect URL after the canonical exists returns upvoted', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const originalUrl = `https://redir-pre-${random}.example.com/feed.xml`
      const canonicalUrl = `https://redir-can-${random}.example.com/feed.xml`
      const firstFetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (rssFeedUrl: string): Promise<FeedClassification> => {
          if (rssFeedUrl === originalUrl) {
            return { kind: 'redirect', location: canonicalUrl, isPermanent: true }
          }
          expect(rssFeedUrl).toBe(canonicalUrl)
          return {
            kind: 'feed',
            title: `Canonical Feed ${random}`,
            feedType: 'article',
          }
        },
      )

      const first = await createSourceFromUrl(WEB_PROVENANCE, user, originalUrl, {
        fetchAndClassifyFeedImpl: firstFetchAndClassifyFeedImpl,
      })
      expect(first.status).toBe('created')

      const secondFetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (): Promise<FeedClassification> => ({
          kind: 'feed',
          title: `Canonical Feed ${random}`,
          feedType: 'article',
        }),
      )

      const second = await createSourceFromUrl(WEB_PROVENANCE, user, canonicalUrl, {
        fetchAndClassifyFeedImpl: secondFetchAndClassifyFeedImpl,
      })
      expect(second.status).toBe('upvoted')
      expect(second.rss_feed_id).toBe(first.rss_feed_id)
    })

    it('throws 422 when redirect hops exceed the limit', async () => {
      const random = Math.random().toString(36).slice(2, 12)
      const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
        async (rssFeedUrl: string): Promise<FeedClassification> => ({
          kind: 'redirect',
          location: `${rssFeedUrl}-hop`,
          isPermanent: false,
        }),
      )

      await expect(
        createSourceFromUrl(
          WEB_PROVENANCE,
          user,
          `https://redir-start-${random}.example.com/feed.xml`,
          {
            fetchAndClassifyFeedImpl,
          },
        ),
      ).rejects.toMatchObject({ status: 422 })
    })
  })
})
