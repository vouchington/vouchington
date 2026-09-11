import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import serverApp from '../../../backend/entrypoints/api/index.mts'
import * as serverRoutes from '@/lib/api/server'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertTestUrl,
  insertTestUrlHostname,
} from '../../../backend/test-helpers/index.mts'
import { listenOnFetchSafeLoopback } from '../routes.mts'

describe('routes — public and direct', () => {
  let backendServer: http.Server
  let previousApiBaseUrl: string | undefined
  let previousPublicApiBaseUrl: string | undefined
  let backendBaseUrl: string

  let topicId: string
  let postId: string
  let rssFeedItemEntityId: string
  let hostnameId: string

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = http.createServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl

    const user = await createTestUser()
    const admin = await createTestUser({ administrator: true })

    const topic = await createTestTopic({ user: admin })
    topicId = topic.id

    const post = await createTestPost({ user })
    postId = post.id

    const rssFeedId = await createTestRssFeedWithTiming(topic.id)
    const rssFeedItemResult = await createTestRssFeedItemWithUrl(rssFeedId)
    rssFeedItemEntityId = rssFeedItemResult.id

    const hostname = `web-api-pub-${randomUUID()}.example.com`
    hostnameId = await insertTestUrlHostname({
      hostname,
      blocked: false,
      crawlable: true,
    })
    await insertTestUrl({
      url: `https://${hostname}/path`,
      hostnameId,
    })
  }, 15_000)

  afterAll(async () => {
    await new Promise<void>(resolve => {
      backendServer.close(() => resolve())
    })
    if (previousApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL
    } else {
      process.env.API_BASE_URL = previousApiBaseUrl
    }

    if (previousPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicApiBaseUrl
    }
  }, 15_000)

  describe('web server API public routes', () => {
    it('getTopic resolves the created topic', async () => {
      const result = await serverRoutes.getTopic(topicId)
      expect(result).not.toBeNull()
      expect(result?.topic.id).toBe(topicId)
    })

    it('getTopics returns a list of topics', async () => {
      const result = await serverRoutes.getTopics()
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getPosts returns a list of posts', async () => {
      const result = await serverRoutes.getPosts()
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getPost resolves the created post', async () => {
      const result = await serverRoutes.getPost(postId)
      expect(result).not.toBeNull()
      expect(result?.post.id).toBe(postId)
    })

    it('getPostAncestors includes only the post itself for a top-level post', async () => {
      const result = await serverRoutes.getPostAncestors(postId)
      expect(result.results).toEqual([{ __entity_type: 'post', id: postId }])
    })

    it('getPostDescendants returns an empty result for a post with no replies', async () => {
      const result = await serverRoutes.getPostDescendants(postId)
      expect(result.results).toEqual([])
    })

    it('getRssFeedItems returns a list of rss feed items', async () => {
      const result = await serverRoutes.getRssFeedItems()
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getEntityRelations returns an empty result for topic faq/post relations', async () => {
      const result = await serverRoutes.getEntityRelations('topic', topicId, 'faq', 'post', {
        searchParams: { positiveNetVoteScore: true, sort: 'best' },
      })
      expect(result.results).toEqual([])
    })

    it('getEntityRelations returns an empty result for topic related/topic relations', async () => {
      const result = await serverRoutes.getEntityRelations('topic', topicId, 'related', 'topic', {
        searchParams: { positiveNetVoteScore: true, sort: 'best' },
      })
      expect(result.results).toEqual([])
    })

    it('getEntityRelations returns an empty result for post category/topic relations', async () => {
      const result = await serverRoutes.getEntityRelations('post', postId, 'category', 'topic', {
        searchParams: { positiveNetVoteScore: true, sort: 'best' },
      })
      expect(result.results).toEqual([])
    })

    it('getEntityRelations returns an empty result for post related/post relations', async () => {
      const result = await serverRoutes.getEntityRelations('post', postId, 'related', 'post', {
        searchParams: { positiveNetVoteScore: true, sort: 'best' },
      })
      expect(result.results).toEqual([])
    })

    it('getEntityRelations returns an empty result for rss feed item category/topic relations', async () => {
      const result = await serverRoutes.getEntityRelations(
        'rss_feed_item',
        rssFeedItemEntityId,
        'category',
        'topic',
        {
          searchParams: { positiveNetVoteScore: true, sort: 'best' },
        },
      )
      expect(result.results).toEqual([])
    })

    it('getTrendingRssFeeds returns a list of rss feeds', async () => {
      const result = await serverRoutes.getTrendingRssFeeds({
        searchParams: { time_range: 'week' },
      })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getTopHostnames returns a list of hostnames', async () => {
      const result = await serverRoutes.getTopHostnames()
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getHostnamesCompare returns the compared hostname', async () => {
      const result = await serverRoutes.getHostnamesCompare([hostnameId])
      expect(result.hostnames[hostnameId]?.id).toBe(hostnameId)
    })
  })

  describe('web API entity helpers', () => {
    it('server getPost returns null for missing entities', async () => {
      await expect(serverRoutes.getPost('missing-web-api-post')).resolves.toBeNull()
    })

    it('server getTopic returns null for missing entities', async () => {
      await expect(serverRoutes.getTopic('missing-web-api-topic')).resolves.toBeNull()
    })
  })
})
