import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { randomUUID } from 'node:crypto'

import http from 'node:http'

import serverApp from '../../../backend/entrypoints/api/index.mts'

import * as serverRoutes from '@/lib/api/server'

import {
  createTestAgent,
  createTestConversation,
  createTestConversationMessage,
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestCrawl,
  insertTestCrawler,
  insertTestHouseholdMembership,
  insertTestPost,
  insertTestUrl,
  insertTestUrlHostname,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
} from '../../../backend/test-helpers/index.mts'

import { createHousehold } from '../../../backend/services/individuals-households/index.mts'

import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../routes.mts'

describe('routes — user and admin', () => {
  let backendServer: http.Server

  let previousApiBaseUrl: string | undefined

  let previousPublicApiBaseUrl: string | undefined

  let backendBaseUrl: string

  let userCookieHeader: Record<string, string>

  let topicId: string

  let postId: string

  let rssFeedItemEntityId: string

  let householdId: string

  let householdMemberIndividualId: string

  let conversationId: string

  let hostnameId: string

  let urlId: string

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = http.createServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl

    const user = await createTestUser()
    const admin = await createTestUser({ administrator: true })

    userCookieHeader = await createWebApiTestCookieHeader(user.id)
    await createWebApiTestCookieHeader(admin.id)

    const topic = await createTestTopic({ user: admin })
    topicId = topic.id

    const post = await createTestPost({ user })
    postId = post.id
    await insertTestPost({
      title: 'Web API review queue post',
      slug: `web-api-review-queue-ua-${randomUUID()}`,
      createdById: user.id,
      markdown: 'Review queue fixture for web API helper coverage.',
      clearanceStatus: 'rejected',
    })

    const rssFeedId = await createTestRssFeedWithTiming(topic.id)
    const rssFeedItemResult = await createTestRssFeedItemWithUrl(rssFeedId)
    rssFeedItemEntityId = rssFeedItemResult.id

    const household = await createHousehold(user)
    householdId = household.id
    const householdMember = await createTestUser()
    householdMemberIndividualId = householdMember.individual_id!
    await insertTestHouseholdMembership({
      householdId,
      individualId: householdMemberIndividualId,
    })
    const agent = await createTestAgent({ activated: true })

    const conversation = await createTestConversation({
      createdById: user.id,
      title: 'Web API Test Conversation',
    })
    conversationId = conversation.id

    await createTestConversationMessage({
      conversationId,
      createdById: agent.system_user_id,
      content: { role: 'assistant', text: 'Hello from the test agent' },
    })
    const hostname = `web-api-ua-${randomUUID()}.example.com`
    hostnameId = await insertTestUrlHostname({
      hostname,
      blocked: false,
      crawlable: true,
    })
    urlId = await insertTestUrl({
      url: `https://${hostname}/path`,
      hostnameId,
    })
    await insertTestCrawler({
      hostnameId,
      description: 'Web API test crawler',
    })
    await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Web API test crawl markdown',
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

  describe('web server API user routes', () => {
    it('GET /api/v1/feature-flags resolves', async () => {
      await expect(
        serverRoutes.serverApi.get('/api/v1/feature-flags', { headers: userCookieHeader }),
      ).resolves.not.toThrow()
    })

    it('getAuthMe returns the authenticated user', async () => {
      const result = await serverRoutes.getAuthMe({ headers: userCookieHeader })
      expect(result.user).toBeDefined()
    })

    it('getPostFeed returns a list of posts', async () => {
      const result = await serverRoutes.getPostFeed('any', { headers: userCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getRssFeedItemsFeed returns a list of rss feed items', async () => {
      const result = await serverRoutes.getRssFeedItemsFeed('any', { headers: userCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getHouseholds returns the created household', async () => {
      const result = await serverRoutes.getHouseholds({ headers: userCookieHeader })
      expect(result.results.some(household => household.id === householdId)).toBe(true)
    })

    it('getHouseholdMemberships returns the inserted membership', async () => {
      const result = await serverRoutes.getHouseholdMemberships(householdId, {
        headers: userCookieHeader,
      })
      expect(
        result.results.some(membership => membership.individual.id === householdMemberIndividualId),
      ).toBe(true)
    })

    it('getMyProfile returns the authenticated user profile', async () => {
      const result = await serverRoutes.getMyProfile({ headers: userCookieHeader })
      expect(result.profile).toBeDefined()
    })

    it('getMyProfileLinks returns a list', async () => {
      const result = await serverRoutes.getMyProfileLinks({ headers: userCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getMyIdentity returns the authenticated user identity', async () => {
      const result = await serverRoutes.getMyIdentity({ headers: userCookieHeader })
      expect(result.identity).toBeDefined()
    })

    it('getMyEmailAddresses returns a list', async () => {
      const result = await serverRoutes.getMyEmailAddresses({ headers: userCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getPasskeys returns a list', async () => {
      const result = await serverRoutes.getPasskeys({ headers: userCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getPost resolves the created post', async () => {
      const result = await serverRoutes.getPost(postId, { headers: userCookieHeader })
      expect(result).not.toBeNull()
      expect(result?.post.id).toBe(postId)
    })

    it('getTopic resolves the created topic', async () => {
      const result = await serverRoutes.getTopic(topicId, { headers: userCookieHeader })
      expect(result).not.toBeNull()
      expect(result?.topic.id).toBe(topicId)
    })

    it('getEntityRelations returns an empty result for topic faq/post relations', async () => {
      const result = await serverRoutes.getEntityRelations('topic', topicId, 'faq', 'post', {
        headers: userCookieHeader,
        searchParams: { positiveNetVoteScore: true, sort: 'best' },
      })
      expect(result.results).toEqual([])
    })

    it('getEntityRelations returns an empty result for topic related/topic relations', async () => {
      const result = await serverRoutes.getEntityRelations('topic', topicId, 'related', 'topic', {
        headers: userCookieHeader,
        searchParams: { positiveNetVoteScore: true, sort: 'best' },
      })
      expect(result.results).toEqual([])
    })

    it('getEntityRelations returns an empty result for post category/topic relations', async () => {
      const result = await serverRoutes.getEntityRelations('post', postId, 'category', 'topic', {
        headers: userCookieHeader,
        searchParams: { positiveNetVoteScore: true, sort: 'best' },
      })
      expect(result.results).toEqual([])
    })

    it('getEntityRelations returns an empty result for post related/post relations', async () => {
      const result = await serverRoutes.getEntityRelations('post', postId, 'related', 'post', {
        headers: userCookieHeader,
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
          headers: userCookieHeader,
          searchParams: { positiveNetVoteScore: true, sort: 'best' },
        },
      )
      expect(result.results).toEqual([])
    })

    it('getMySpendingCategories returns a list', async () => {
      const result = await serverRoutes.getMySpendingCategories({ headers: userCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getMyRewardsProgramPointValuations returns a list', async () => {
      const result = await serverRoutes.getMyRewardsProgramPointValuations({
        headers: userCookieHeader,
      })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getMyCards returns a list', async () => {
      const result = await serverRoutes.getMyCards({ headers: userCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getMyRewardsProgramStatuses returns a list', async () => {
      const result = await serverRoutes.getMyRewardsProgramStatuses({ headers: userCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getMyContributionStatus returns the contribution status', async () => {
      const result = await serverRoutes.getMyContributionStatus({ headers: userCookieHeader })
      expect(result.contribution_status).toBeDefined()
    })
  })
})
