import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUserWithAge,
  insertTestRssFeedItem,
  insertTestTopic,
  insertTestUrlHostname,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { addUrls } from '@services/urls'
import { createRssFeed } from '@services/rss-feeds'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { setTopicHostnameLink } from '@services/topics/hostname-link'
import { createHash } from 'node:crypto'
import type { PrivateUser } from '@services/users/types'

describe('rss-feed-item.vote', () => {
  const suffix = Math.random().toString(36).slice(2, 10)
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })
  async function createLinkedTopicId(name: string, slug: string, createdById: string) {
    const topicId = await insertTestTopic({ name, slug, createdById })
    const hostnameId = await insertTestUrlHostname({ hostname: `${slug}.example.com` })
    await setTopicHostnameLink(topicId, hostnameId)
    return topicId
  }

  describe('RSS Feed Item Vote Routes', () => {
    describe('PUT /api/v1/rss-feed-items/:id/vote', () => {
      it('should allow authenticated user to vote on RSS feed item', async () => {
        const topicId = await createLinkedTopicId(
          `Test Topic ${suffix}-1`,
          `test-topic-rss-vote-1-${suffix}`,
          user.id,
        )

        const rssFeed = await createRssFeed({
          skipRemoteValidation: true,
          rss_feed_url: `https://example.com/feed-vote-${suffix}-1.xml`,
          topic_id: topicId,
          title: 'Test Feed',
        })
        const itemUrls = await addUrls(null, [`https://example.com/item-vote-${suffix}-1`])
        const itemId = await insertTestRssFeedItem({
          rssFeedId: rssFeed.id,
          urlId: itemUrls[0].id,
          guid: `test-item-vote-${suffix}-1`,
          itemData: { title: 'Test Item' },
          contentSha256: createHash('sha256').update('test content vote 1').digest(),
        })

        const item = await getRssFeedItemById(itemId)
        expect(item).toBeDefined()

        const request = createRequest()
        await request.authenticateAs(user)

        await request
          .put(`/api/v1/rss-feed-items/${item!.id}/vote`)
          .send({ choice: 'like' })
          .expect(204)
      })

      it('should return 401 when not authenticated', async () => {
        const topicId = await createLinkedTopicId(
          `Test Topic ${suffix}-2`,
          `test-topic-rss-vote-2-${suffix}`,
          user.id,
        )

        const rssFeed = await createRssFeed({
          skipRemoteValidation: true,
          rss_feed_url: `https://example.com/feed-vote-${suffix}-2.xml`,
          topic_id: topicId,
          title: 'Test Feed 2',
        })
        const itemUrls = await addUrls(null, [`https://example.com/item-vote-${suffix}-2`])
        const itemId = await insertTestRssFeedItem({
          rssFeedId: rssFeed.id,
          urlId: itemUrls[0].id,
          guid: `test-item-vote-${suffix}-2`,
          itemData: { title: 'Test Item 2' },
          contentSha256: createHash('sha256').update('test content vote 2').digest(),
        })

        const item = await getRssFeedItemById(itemId)
        expect(item).toBeDefined()

        const request = createRequest()
        await request
          .put(`/api/v1/rss-feed-items/${item!.id}/vote`)
          .send({ choice: 'like' })
          .expect(401)
      })

      it('should return 422 for invalid score value', async () => {
        const topicId = await createLinkedTopicId(
          `Test Topic ${suffix}-3`,
          `test-topic-rss-vote-3-${suffix}`,
          user.id,
        )

        const rssFeed = await createRssFeed({
          skipRemoteValidation: true,
          rss_feed_url: `https://example.com/feed-vote-${suffix}-3.xml`,
          topic_id: topicId,
          title: 'Test Feed 3',
        })
        const itemUrls = await addUrls(null, [`https://example.com/item-vote-${suffix}-3`])
        const itemId = await insertTestRssFeedItem({
          rssFeedId: rssFeed.id,
          urlId: itemUrls[0].id,
          guid: `test-item-vote-${suffix}-3`,
          itemData: { title: 'Test Item 3' },
          contentSha256: createHash('sha256').update('test content vote 3').digest(),
        })

        const item = await getRssFeedItemById(itemId)
        expect(item).toBeDefined()

        const request = createRequest()
        await request.authenticateAs(user)

        await request
          .put(`/api/v1/rss-feed-items/${item!.id}/vote`)
          .send({ choice: 'invalid' })
          .expect(422)
      })
    })

    describe('GET /api/v1/rss-feed-items/:id/votes', () => {
      it('should return user votes when authenticated', async () => {
        const topicId = await createLinkedTopicId(
          `Test Topic ${suffix}-4`,
          `test-topic-rss-vote-4-${suffix}`,
          user.id,
        )

        const rssFeed = await createRssFeed({
          skipRemoteValidation: true,
          rss_feed_url: `https://example.com/feed-vote-${suffix}-4.xml`,
          topic_id: topicId,
          title: 'Test Feed 4',
        })
        const itemUrls = await addUrls(null, [`https://example.com/item-vote-${suffix}-4`])
        const itemId = await insertTestRssFeedItem({
          rssFeedId: rssFeed.id,
          urlId: itemUrls[0].id,
          guid: `test-item-vote-${suffix}-4`,
          itemData: { title: 'Test Item 4' },
          contentSha256: createHash('sha256').update('test content vote 4').digest(),
        })

        const item = await getRssFeedItemById(itemId)
        expect(item).toBeDefined()

        const request = createRequest()
        await request.authenticateAs(user)

        await request
          .put(`/api/v1/rss-feed-items/${item!.id}/vote`)
          .send({ choice: 'like' })
          .expect(204)

        const response = await request.get(`/api/v1/rss-feed-items/${item!.id}/votes`).expect(200)

        expect(response.body).toHaveProperty('results')
        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.results.length).toBe(1)
        expect(response.body.results[0]).toHaveProperty('entity_id', item!.id)
        expect(response.body.results[0]).toHaveProperty('user_id', user.id)
        expect(response.body.results[0]).toHaveProperty('choice', 'like')
      })

      it('should return 401 when not authenticated', async () => {
        const topicId = await createLinkedTopicId(
          `Test Topic ${suffix}-5`,
          `test-topic-rss-vote-5-${suffix}`,
          user.id,
        )

        const rssFeed = await createRssFeed({
          skipRemoteValidation: true,
          rss_feed_url: `https://example.com/feed-vote-${suffix}-5.xml`,
          topic_id: topicId,
          title: 'Test Feed 5',
        })
        const itemUrls = await addUrls(null, [`https://example.com/item-vote-${suffix}-5`])
        const itemId = await insertTestRssFeedItem({
          rssFeedId: rssFeed.id,
          urlId: itemUrls[0].id,
          guid: `test-item-vote-${suffix}-5`,
          itemData: { title: 'Test Item 5' },
          contentSha256: createHash('sha256').update('test content vote 5').digest(),
        })

        const item = await getRssFeedItemById(itemId)
        expect(item).toBeDefined()

        const request = createRequest()
        await request.get(`/api/v1/rss-feed-items/${item!.id}/votes`).expect(401)
      })

      it('should return all votes for administrators', async () => {
        const user1 = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const user2 = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const admin = await createTestUser({ administrator: true })
        const topicId = await createLinkedTopicId(
          `Test Topic Admin ${suffix}`,
          `test-topic-rss-vote-admin-${suffix}`,
          user1!.id,
        )

        const rssFeed = await createRssFeed({
          skipRemoteValidation: true,
          rss_feed_url: `https://example.com/feed-vote-admin-${suffix}.xml`,
          topic_id: topicId,
          title: 'Test Feed Admin',
        })
        const itemUrls = await addUrls(null, [`https://example.com/item-vote-admin-${suffix}`])
        const itemId = await insertTestRssFeedItem({
          rssFeedId: rssFeed.id,
          urlId: itemUrls[0].id,
          guid: `test-item-vote-admin-${suffix}`,
          itemData: { title: 'Test Item Admin' },
          contentSha256: createHash('sha256').update('test content vote admin').digest(),
        })

        const item = await getRssFeedItemById(itemId)
        expect(item).toBeDefined()

        const request = createRequest()
        await request.authenticateAs(user1!)
        await request
          .put(`/api/v1/rss-feed-items/${item!.id}/vote`)
          .send({ choice: 'like' })
          .expect(204)

        await request.authenticateAs(user2!)
        await request
          .put(`/api/v1/rss-feed-items/${item!.id}/vote`)
          .send({ choice: 'dislike' })
          .expect(204)

        await request.authenticateAs(admin!)
        const response = await request.get(`/api/v1/rss-feed-items/${item!.id}/votes`).expect(200)

        expect(response.body).toHaveProperty('results')
        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.results.length).toBe(2)
      })
    })
  })
})
