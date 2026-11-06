import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUrlWithHostname,
  insertEntityRelation,
  insertTestPost,
  insertHackerNewsReferencesForTest,
} from '@voucha/test-helpers'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

describe('private post collection Hacker News sidecars', () => {
  it('returns counts for each collection and omits them while visibility is off', async () => {
    const owner = await createTestUser()
    const urlId = await createTestUrlWithHostname()
    const postId = await insertTestPost({
      createdById: owner.id,
      title: `Collection references ${owner.id}`,
      slug: `collection-references-${owner.id}`,
      markdown: '',
      postType: 'link',
      urlId,
    })
    await insertHackerNewsReferencesForTest({ url_id: urlId, story_count: 2, comment_count: 1 })
    const lists = [
      ['saved', 'relation__user__save__post'],
      ['hidden', 'relation__user__hide__post'],
      ['following', 'relation__user__follow__post'],
      ['subscribed', 'relation__user__subscribe__post'],
    ] as const
    const request = createRequest()
    await request.authenticateAs(owner)
    for (const [list, table] of lists) {
      await insertEntityRelation(table, owner.id, postId)
      const response = await request.get(`/api/v1/users/${owner.id}/posts/${list}`).expect(200)
      expect(response.body.post_hacker_news_references).toEqual({
        [postId]: { story_count: 2, comment_count: 1 },
      })
      expect(response.headers['cache-control']).toBe('private, no-store')
    }
    const restore = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: false,
    })
    try {
      const hidden = await request.get(`/api/v1/users/${owner.id}/posts/saved`).expect(200)
      expect(hidden.body.post_hacker_news_references).toEqual({})
    } finally {
      restore()
    }
  })
})
