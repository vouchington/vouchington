import { createHash, randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  softDeleteRssFeedItemsForTest,
  suspendTestUser,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { setRssFeedDiscoverabilityAsSystem } from '@services/rss-feeds/discoverability'
import { runContributionAdmission } from '@services/contribution-gating/admission'
import { CONTRIBUTION_ADMISSION_CLAIM_SECONDS } from '@services/contribution-gating/config'
import type { PrivateUser } from '@services/users/types'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

let user: PrivateUser
let feedId: string
let urlId: string

describe('discussion', () => {
  beforeAll(async () => {
    // Admin bypasses contribution gates so happy-path tests aren't blocked by the age gate.
    user = await createTestUser({ administrator: true })
    feedId = (await createTestRssFeed({})).id
    urlId = await createTestUrlWithHostname()
  })

  async function makeItem(title?: string) {
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: title ?? `Item ${random}`, link: `https://example.com/${random}` }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `rfi-discussion-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
    return { itemId, itemTitle: itemData.title }
  }

  describe('POST /api/v1/rss-feed-items/:id/discussions', () => {
    it('returns 401 when unauthenticated', async () => {
      const { itemId } = await makeItem()
      const request = createRequest()
      await request.post(`/api/v1/rss-feed-items/${itemId}/discussions`).expect(401)
    })

    it('returns 400 for invalid UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/rss-feed-items/not-a-uuid/discussions').expect(400)
    })

    it('returns 404 for unknown item', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post(`/api/v1/rss-feed-items/${randomUUID()}/discussions`).expect(404)
    })

    it('creates a link post referencing the item URL and returns it', async () => {
      const { itemId } = await makeItem('Test article title')
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post(`/api/v1/rss-feed-items/${itemId}/discussions`)
        .expect(200)

      expect(response.body.post).toBeDefined()
      expect(response.body.post.post_type).toBe('link')
      expect(response.body.post.url_id).toBe(urlId)
    })

    it('replays a supplied idempotency key without creating another discussion', async () => {
      const { itemId } = await makeItem()
      const request = createRequest()
      await request.authenticateAs(user)
      const key = randomUUID()
      const first = await request
        .post(`/api/v1/rss-feed-items/${itemId}/discussions`)
        .set('Idempotency-Key', key)
        .expect(200)
      const replay = await request
        .post(`/api/v1/rss-feed-items/${itemId}/discussions`)
        .set('Idempotency-Key', key)
        .expect(200)

      expect(replay.body.post.id).toBe(first.body.post.id)
    })

    it('replays a committed response after the feed item is deleted', async () => {
      const { itemId } = await makeItem()
      const request = createRequest()
      await request.authenticateAs(user)
      const key = randomUUID()
      const first = await request
        .post(`/api/v1/rss-feed-items/${itemId}/discussions`)
        .set('Idempotency-Key', key)
        .expect(200)

      await softDeleteRssFeedItemsForTest([itemId])
      const replay = await request
        .post(`/api/v1/rss-feed-items/${itemId}/discussions`)
        .set('Idempotency-Key', key)
        .expect(200)

      expect(replay.body).toEqual(first.body)
    })

    it('returns a retryable response while the same admission is in progress', async () => {
      const { itemId } = await makeItem()
      const request = createRequest()
      await request.authenticateAs(user)
      const key = randomUUID()
      const claimed = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const pendingAdmission = runContributionAdmission({
        actorId: user.id,
        idempotencyKey: key,
        intent: { route: 'rss-feed-items.discussions.create', rss_feed_item_id: itemId },
        beforeCommit: async () => {
          claimed.resolve()
          await release.promise
        },
        execute: async () => ({ post: { id: randomUUID() } }),
      })
      await claimed.promise

      try {
        const response = await request
          .post(`/api/v1/rss-feed-items/${itemId}/discussions`)
          .set('Idempotency-Key', key)
          .expect(409)
        expect(response.body.code).toBe('CONTRIBUTION_ADMISSION_IN_PROGRESS')
        const retryAfterSeconds = Number(response.headers['retry-after'])
        expect(retryAfterSeconds).toBeGreaterThan(0)
        expect(retryAfterSeconds).toBeLessThanOrEqual(CONTRIBUTION_ADMISSION_CLAIM_SECONDS)
      } finally {
        release.resolve()
        await pendingAdmission
      }
    })

    it('rejects a malformed Idempotency-Key header before mutation', async () => {
      const { itemId } = await makeItem()
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post(`/api/v1/rss-feed-items/${itemId}/discussions`)
        .set('Idempotency-Key', 'not-a-uuid')
        .expect(400)
    })

    it('post is immediately visible to creator (regression: no 404 after redirect)', async () => {
      const { itemId } = await makeItem()
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post(`/api/v1/rss-feed-items/${itemId}/discussions`)
        .expect(200)
      const postSlug = response.body.post.slug

      await request.get(`/api/v1/posts/${postSlug}`).expect(200)
    })

    it('returns 403 for a suspended user', async () => {
      const { itemId } = await makeItem()
      const suspendedUser = await createTestUser({ administrator: true })
      await suspendTestUser(suspendedUser.id, 'test-suspension')
      const request = createRequest()
      await request.authenticateAs(suspendedUser)
      await request.post(`/api/v1/rss-feed-items/${itemId}/discussions`).expect(403)
    })

    it('returns 403 for a contribution-gated user (account too new)', async () => {
      const { itemId } = await makeItem()
      const gatedUser = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(gatedUser)
      await request.post(`/api/v1/rss-feed-items/${itemId}/discussions`).expect(403)
    })

    it('creates a link post even when the source feed is not discoverable', async () => {
      const nonDiscoverableFeed = await createTestRssFeed({})
      await setRssFeedDiscoverabilityAsSystem({
        rssFeedId: nonDiscoverableFeed.id,
        enabled: false,
        reason: 'test: non-discoverable — no gate for link posts',
      })

      const random = Math.random().toString(36).slice(2, 10)
      const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
      const itemId = await insertTestRssFeedItem({
        rssFeedId: nonDiscoverableFeed.id,
        urlId,
        guid: `rfi-discussion-not-discoverable-${random}`,
        itemData,
        contentSha256: sha256(itemData),
      })

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post(`/api/v1/rss-feed-items/${itemId}/discussions`)
        .expect(200)
      expect(response.body.post.post_type).toBe('link')
    })
  })
})
