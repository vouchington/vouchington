import { createHash, randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { setRssFeedDiscoverabilityAsSystem } from '@services/rss-feeds/discoverability'
import { FEED_NOT_DISCOVERABLE } from '@modules/on-error/error-codes'
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
    const [testUser, _systemAdmin, feed, testUrlId] = await Promise.all([
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
      upsertSystemAdministrator('story-teller'),
      createTestRssFeed({}),
      createTestUrlWithHostname(),
    ])
    user = testUser!
    feedId = feed.id
    urlId = testUrlId
    await import('./discussion.mts')
  })

  async function makeStoryWithItem(title?: string, rssFeedId = feedId) {
    const story = await insertTestStory({ title: title ?? 'Discussion API Test' })
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
    const itemId = await insertTestRssFeedItem({
      rssFeedId,
      urlId,
      guid: `api-discussion-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
    await setTestItemStoryId(itemId, story.id)
    const random2 = Math.random().toString(36).slice(2, 10)
    const itemData2 = { title: `Item ${random2}`, link: `https://example.com/${random2}` }
    const itemId2 = await insertTestRssFeedItem({
      rssFeedId,
      urlId,
      guid: `api-discussion-test-2-${random2}`,
      itemData: itemData2,
      contentSha256: sha256(itemData2),
    })
    await setTestItemStoryId(itemId2, story.id)
    return { story, itemId, itemId2 }
  }

  describe('POST /api/v1/stories/:storyId/discussions', () => {
    it('returns 401 when unauthenticated', async () => {
      const { story } = await makeStoryWithItem()
      const request = createRequest()
      await request.post(`/api/v1/stories/${story.id}/discussions`).expect(401)
    })

    it('returns 400 for invalid UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/stories/not-a-uuid/discussions').expect(400)
    })

    it('returns 404 for unknown story', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post(`/api/v1/stories/${randomUUID()}/discussions`).expect(404)
    })

    it('returns 200 with post and story on success', async () => {
      const { story } = await makeStoryWithItem('Story with Discussion')
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.post(`/api/v1/stories/${story.id}/discussions`).expect(200)

      expect(response.body.post).toBeDefined()
      expect(response.body.post.post_type).toBe('story')
      // Multi-item story: title comes from story.title
      expect(response.body.post.title).toBe('Story with Discussion')
      // Agent has not run yet — summary is empty
      expect(response.body.post.ai_summary_markdown).toBe('')
      expect(response.body.story).toBeDefined()
      expect(response.body.postStory).toBeDefined()
      expect(response.body.postStory.post_id).toBe(response.body.post.id)
      expect(response.body.postStory.story_id).toBe(story.id)
    })

    it('post is immediately visible to the creator (regression: no 404 after redirect)', async () => {
      const { story } = await makeStoryWithItem('Immediate Visibility Test')
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.post(`/api/v1/stories/${story.id}/discussions`).expect(200)
      const postSlug = response.body.post.slug

      await request.get(`/api/v1/posts/${postSlug}`).expect(200)
    })

    it('returns 409 if discussion already exists', async () => {
      const { story } = await makeStoryWithItem('Duplicate Discussion')
      const request = createRequest()
      await request.authenticateAs(user)

      // First call succeeds
      await request.post(`/api/v1/stories/${story.id}/discussions`).expect(200)

      // Second call returns 409
      await request.post(`/api/v1/stories/${story.id}/discussions`).expect(409)
    })

    it('replays a committed response after the source feed becomes undiscoverable', async () => {
      const replayFeed = await createTestRssFeed({})
      const { story } = await makeStoryWithItem('Durable replay story', replayFeed.id)
      const request = createRequest()
      await request.authenticateAs(user)
      const key = randomUUID()
      const first = await request
        .post(`/api/v1/stories/${story.id}/discussions`)
        .set('Idempotency-Key', key)
        .expect(200)

      await setRssFeedDiscoverabilityAsSystem({
        rssFeedId: replayFeed.id,
        enabled: false,
        reason: 'test: mutable eligibility changed after commit',
      })
      const replay = await request
        .post(`/api/v1/stories/${story.id}/discussions`)
        .set('Idempotency-Key', key)
        .expect(200)

      expect(replay.body).toEqual(first.body)
    })

    it('returns a retryable response while the same admission is in progress', async () => {
      const { story } = await makeStoryWithItem()
      const request = createRequest()
      await request.authenticateAs(user)
      const key = randomUUID()
      const claimed = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const pendingAdmission = runContributionAdmission({
        actorId: user.id,
        idempotencyKey: key,
        intent: { route: 'stories.discussions.create', story_id: story.id },
        beforeCommit: async () => {
          claimed.resolve()
          await release.promise
        },
        execute: async () => ({ post: { id: randomUUID() } }),
      })
      await claimed.promise

      try {
        const response = await request
          .post(`/api/v1/stories/${story.id}/discussions`)
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

    it("returns 403 with FEED_NOT_DISCOVERABLE when the story's source feed is not discoverable", async () => {
      const nonDiscoverableFeed = await createTestRssFeed({})
      await setRssFeedDiscoverabilityAsSystem({
        rssFeedId: nonDiscoverableFeed.id,
        enabled: false,
        reason: 'test: non-discoverable for discussion bifurcation',
      })

      const random = Math.random().toString(36).slice(2, 10)
      const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
      const itemId = await insertTestRssFeedItem({
        rssFeedId: nonDiscoverableFeed.id,
        urlId,
        guid: `story-discussion-not-discoverable-${random}`,
        itemData,
        contentSha256: sha256(itemData),
      })
      const story = await insertTestStory({ title: 'Non-discoverable Story' })
      await setTestItemStoryId(itemId, story.id)

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.post(`/api/v1/stories/${story.id}/discussions`).expect(403)
      expect(response.body.code).toBe(FEED_NOT_DISCOVERABLE)
    })
  })
})
