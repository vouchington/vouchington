import { randomInt, randomUUID } from 'node:crypto'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUrlWithHostname,
  insertTestPost,
  insertHackerNewsReferencesForTest,
} from '@voucha/test-helpers'
import { backendResponseContracts } from '../../../test-helpers/api-fixtures/response-contracts.mts'
import { validateResponseContract } from '../../../test-helpers/api-fixtures/contract-schema.mts'
import { insertHackerNewsRelatedUrlsForTest } from '@voucha/test-helpers/hacker-news-related-urls'
import { setHackerNewsReferenceFlagsForTest } from '@voucha/test-helpers/hacker-news-references'
import { describe, expect, it } from 'vitest'

describe('Hacker News post fixture contract', () => {
  it('returns filtered list counts and detail references from the same URL', async () => {
    const owner = await createTestUser()
    const urlId = await createTestUrlWithHostname()
    const slug = `hn-fixture-${randomUUID()}`
    const postId = await insertTestPost({
      createdById: owner.id,
      title: slug,
      slug,
      markdown: '',
      postType: 'review',
    })
    await insertHackerNewsRelatedUrlsForTest(postId, owner.id, [{ urlId, up: 5 }])
    await setHackerNewsReferenceFlagsForTest([postId], [])
    const storyId = randomInt(1_000_000_000, 2_000_000_000)
    const commentId = storyId + 1
    await insertHackerNewsReferencesForTest({
      url_id: urlId,
      story_count: 1,
      comment_count: 1,
      stories: [
        {
          hacker_news_item_id: storyId,
          points: 12,
          reply_count: 4,
          posted_at: '2026-11-01T00:00:00Z',
        },
      ],
      comments: [
        {
          hacker_news_item_id: commentId,
          parent_story_item_id: storyId,
          posted_at: '2026-11-01T01:00:00Z',
        },
      ],
    })
    const request = createRequest()
    await request.authenticateAs(owner)
    const list = await request
      .get('/api/v1/posts')
      .query({
        creator: owner.id,
        post_types: 'review',
        has_hacker_news_references: 'true',
        time_range: 'all',
        sort: 'new',
      })
      .expect(200)
    expect(
      validateResponseContract(backendResponseContracts['GET:/api/v1/posts']!.schema, list.body),
    ).toEqual([])
    expect(list.body.results.some((row: { id: string }) => row.id === postId)).toBe(true)
    expect(list.body.post_hacker_news_references[postId]).toEqual({
      story_count: 1,
      comment_count: 1,
    })

    const detail = await request.get(`/api/v1/posts/${slug}`).expect(200)
    expect(
      validateResponseContract(
        backendResponseContracts['GET:/api/v1/posts/:postIdOrSlug']!.schema,
        detail.body,
      ),
    ).toEqual([])
    expect(detail.body.post_hacker_news_references[postId]).toMatchObject({
      story_count: 1,
      comment_count: 1,
      stories: [expect.objectContaining({ hacker_news_item_id: storyId })],
      comments: [expect.objectContaining({ hacker_news_item_id: commentId })],
    })
  })
})
