import { describe, it, expect } from 'vitest'
import { encodeCursor } from '@modules/pagination'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestTopic,
  insertTestRssFeed,
  createTestUser,
  createTestMembership,
} from '@voucha/test-helpers'

describe('index', () => {
  describe('RSS Feeds Routes', () => {
    describe('GET /api/v1/rss-feeds/:id/crawls', () => {
      it('should return 400 for a crawls after cursor with a non-UUID id', async () => {
        const paidUser = await createTestUser()
        await createTestMembership({ user_id: paidUser.id, plan: 'plus', status: 'active' })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Non-UUID Crawl Cursor Topic ${random}`,
          slug: `non-uuid-crawl-cursor-topic-${random}`,
          createdById: paidUser.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Non-UUID Crawl Cursor Feed ${random}`,
        })
        const cursor = encodeCursor({ id: 'not-a-uuid', scope: `rss-feed:${feedId}:crawls` })
        const request = createRequest()
        await request.authenticateAs(paidUser)
        const response = await request
          .get(`/api/v1/rss-feeds/${feedId}/crawls?after=${encodeURIComponent(cursor)}`)
          .expect(400)

        expect(response.body.message).toBe('Invalid cursor: id is not a valid UUID')
      })
    })
  })
})
