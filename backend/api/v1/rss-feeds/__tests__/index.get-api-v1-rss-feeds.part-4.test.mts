import { describe, it, expect } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestTopic,
  insertTestRssFeed,
  createTestUser,
  safeUsername,
} from '@voucha/test-helpers'

import { bookmarkEntity } from '@services/bookmarks'

describe('GET /api/v1/rss-feeds — authenticated sidecars with bookmarks', () => {
  it('returns bookmarks sidecar when authenticated viewer has bookmarked the topic', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const user = await createTestUser({ username: safeUsername(`rss-bkmk-owner-${random}`) })
    const viewer = await createTestUser({
      username: safeUsername(`rss-bkmk-viewer-${random}`),
    })
    const topicId = await insertTestTopic({
      name: `RSS Bkmk Topic ${random}`,
      slug: `rss-bkmk-topic-${random}`,
      createdById: user.id,
    })
    await insertTestRssFeed({
      topicId,
      title: `RSS Bkmk Feed ${random}`,
    })
    // Viewer bookmarks (follows) the topic so topicBookmarks is non-empty → sidecars.bookmarks assigned
    await bookmarkEntity(viewer, 'topic', { id: topicId }, 'follow')

    const request = createRequest()
    await request.authenticateAs(viewer)
    const response = await request.get(`/api/v1/rss-feeds?topic=${topicId}`).expect(200)

    // Lines 91 and 93 in rss-feeds.mts: buildRssFeedSidecars + ctx.json
    expect(response.body.results).toBeDefined()
    expect(response.body.topic_elections).toBeDefined()
    expect(response.body.hostname_elections).toBeDefined()
    expect(response.body.bookmarks).toBeDefined()
    expect(response.body.bookmarks[topicId]).toBeDefined()
  })
})
