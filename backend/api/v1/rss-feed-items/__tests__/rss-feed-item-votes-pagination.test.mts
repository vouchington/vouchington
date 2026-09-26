import { describe, it, expect } from 'vitest'
import { v7 } from 'uuid'
import { createHash } from 'node:crypto'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUserWithAge,
  insertTestRssFeedItem,
  insertTestTopic,
  insertTestUrlHostname,
  CONTRIBUTING_USER_AGE_MS,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { addUrls } from '@services/urls'
import { createRssFeed } from '@services/rss-feeds'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { setTopicHostnameLink } from '@services/topics/hostname-link'
import { encodeScopedUuidCursor } from '@modules/pagination'

async function createLinkedTopicId(createdById: string) {
  const random = crypto.randomUUID().slice(0, 8)
  const topicId = await insertTestTopic({
    name: `RSS Votes Pagination Topic ${random}`,
    slug: `rss-votes-pagination-topic-${random}`,
    createdById,
  })
  const hostnameId = await insertTestUrlHostname({
    hostname: `rss-votes-pagination-${random}.example.com`,
  })
  await setTopicHostnameLink(topicId, hostnameId)
  return topicId
}

async function createTestRssFeedItemForVoting(creator: string) {
  const random = crypto.randomUUID().slice(0, 8)
  const topicId = await createLinkedTopicId(creator)
  const rssFeed = await createRssFeed({
    provenance: WEB_PROVENANCE,
    skipRemoteValidation: true,
    rss_feed_url: `https://example.com/votes-pagination-feed-${random}.xml`,
    topic_id: topicId,
    title: `Votes Pagination Feed ${random}`,
  })
  const itemUrls = await addUrls(null, [`https://example.com/votes-pagination-item-${random}`])
  const itemId = await insertTestRssFeedItem({
    rssFeedId: rssFeed.id,
    urlId: itemUrls[0].id,
    guid: `votes-pagination-item-${random}`,
    itemData: { title: `Votes Pagination Item ${random}` },
    contentSha256: createHash('sha256').update(`votes pagination content ${random}`).digest(),
  })
  const item = await getRssFeedItemById(itemId)
  if (!item) throw new Error('Missing RSS feed item')
  return item.id
}

describe('GET /api/v1/rss-feed-items/:id/votes pagination', () => {
  describe('admin branch (all voters)', () => {
    it('returns empty results with null cursors for an item with no votes', async () => {
      const admin = await createTestUser({ administrator: true })
      const itemId = await createTestRssFeedItemForVoting(admin.id)
      const req = createRequest()
      await req.authenticateAs(admin)

      const res = await req.get(`/api/v1/rss-feed-items/${itemId}/votes`).expect(200)
      expect(res.body.results).toEqual([])
      expect(res.body.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    })

    it('paginates across multiple voters without duplicates or gaps', async () => {
      const admin = await createTestUser({ administrator: true })
      const itemId = await createTestRssFeedItemForVoting(admin.id)
      const voterA = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const voterB = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const voterC = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      for (const voter of [voterA, voterB, voterC]) {
        await req.authenticateAs(voter)
        await req.put(`/api/v1/rss-feed-items/${itemId}/vote`).send({ choice: 'like' }).expect(204)
      }

      await req.authenticateAs(admin)
      const page1 = await req.get(`/api/v1/rss-feed-items/${itemId}/votes?limit=2`).expect(200)
      expect(page1.body.results).toHaveLength(2)
      expect(page1.body.page_info.has_next_page).toBe(true)
      expect(page1.body.page_info.end_cursor).not.toBeNull()

      const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
      const page2 = await req
        .get(`/api/v1/rss-feed-items/${itemId}/votes?limit=2&after=${cursor}`)
        .expect(200)
      expect(page2.body.results).toHaveLength(1)
      expect(page2.body.page_info.has_next_page).toBe(false)
      expect(page2.body.page_info.end_cursor).toBeNull()

      const seenUserIds = new Set(
        [...page1.body.results, ...page2.body.results].map((v: { user_id: string }) => v.user_id),
      )
      expect(seenUserIds).toEqual(new Set([voterA.id, voterB.id, voterC.id]))
    })

    it('rejects a malformed cursor with 400', async () => {
      const admin = await createTestUser({ administrator: true })
      const itemId = await createTestRssFeedItemForVoting(admin.id)
      const req = createRequest()
      await req.authenticateAs(admin)

      await req.get(`/api/v1/rss-feed-items/${itemId}/votes?after=not-a-real-cursor`).expect(400)
    })

    it('rejects a cursor minted for another item with 400 (cross-resource replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const itemA = await createTestRssFeedItemForVoting(admin.id)
      const itemB = await createTestRssFeedItemForVoting(admin.id)
      const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(voter)
      await req.put(`/api/v1/rss-feed-items/${itemA}/vote`).send({ choice: 'like' }).expect(204)

      await req.authenticateAs(admin)
      const pageA = await req.get(`/api/v1/rss-feed-items/${itemA}/votes?limit=1`).expect(200)
      const cursor = pageA.body.page_info.start_cursor as string
      expect(cursor).not.toBeNull()

      await req
        .get(`/api/v1/rss-feed-items/${itemB}/votes?after=${encodeURIComponent(cursor)}`)
        .expect(400)
    })

    it('rejects a cursor minted for a different endpoint with 400 (cross-endpoint replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const itemId = await createTestRssFeedItemForVoting(admin.id)
      const wrongScope = encodeScopedUuidCursor(v7(), `passkeys:${admin.id}:created-at-asc-id-asc`)

      const req = createRequest()
      await req.authenticateAs(admin)
      await req
        .get(`/api/v1/rss-feed-items/${itemId}/votes?after=${encodeURIComponent(wrongScope)}`)
        .expect(400)
    })
  })

  describe('user branch (own vote only)', () => {
    it('returns empty results with null cursors when the user has not voted', async () => {
      const admin = await createTestUser({ administrator: true })
      const itemId = await createTestRssFeedItemForVoting(admin.id)
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const req = createRequest()
      await req.authenticateAs(user)

      const res = await req.get(`/api/v1/rss-feed-items/${itemId}/votes`).expect(200)
      expect(res.body.results).toEqual([])
      expect(res.body.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    })

    it('returns only the authenticated user vote, not other voters', async () => {
      const admin = await createTestUser({ administrator: true })
      const itemId = await createTestRssFeedItemForVoting(admin.id)
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const otherVoter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(otherVoter)
      await req.put(`/api/v1/rss-feed-items/${itemId}/vote`).send({ choice: 'dislike' }).expect(204)

      await req.authenticateAs(user)
      await req.put(`/api/v1/rss-feed-items/${itemId}/vote`).send({ choice: 'like' }).expect(204)

      const res = await req.get(`/api/v1/rss-feed-items/${itemId}/votes`).expect(200)
      expect(res.body.results).toHaveLength(1)
      expect(res.body.results[0]).toMatchObject({ user_id: user.id, choice: 'like' })
      expect(res.body.page_info.has_next_page).toBe(false)
    })

    it('rejects a cursor minted for the admin branch with 400 (cross-branch replay)', async () => {
      const admin = await createTestUser({ administrator: true })
      const itemId = await createTestRssFeedItemForVoting(admin.id)
      const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)

      const req = createRequest()
      await req.authenticateAs(voter)
      await req.put(`/api/v1/rss-feed-items/${itemId}/vote`).send({ choice: 'like' }).expect(204)

      await req.authenticateAs(admin)
      const adminPage = await req.get(`/api/v1/rss-feed-items/${itemId}/votes?limit=1`).expect(200)
      const cursor = adminPage.body.page_info.start_cursor as string
      expect(cursor).not.toBeNull()

      await req.authenticateAs(voter)
      await req
        .get(`/api/v1/rss-feed-items/${itemId}/votes?after=${encodeURIComponent(cursor)}`)
        .expect(400)
    })
  })
})
