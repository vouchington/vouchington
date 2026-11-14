import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestPost,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createPostStory } from '@services/stories/update'
import { getAnonymousCacheGeneration } from '@services/entity-cache/anonymous-cache-generation'
import { makeTestPostPrivate } from '@voucha/test-helpers/post-write-context'
import { caches } from '@services/entity-cache/caches'
import {
  countCapturedQueriesByAnnotation,
  enableQueryCapture,
  stopTestQueryCapture,
} from '@voucha/test-helpers/query-capture'

describe('anonymous story post mapping routes', () => {
  it('serves warm RSS items and community news from cached story visibility and coherent bodies', async () => {
    const author = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const story = await insertTestStory({ title: 'Cached story mapping' })
    await setTestItemStoryId(item.id, story.id)
    const postId = await insertTestPost({
      title: 'Cached story post',
      slug: `cached-story-post-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: '',
      postType: 'story',
    })
    await createPostStory(postId, story.id, author.id)
    const community = await insertTestCommunity({ createdById: author.id, visibility: 'public' })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: feedId,
      addedById: author.id,
    })
    const request = createRequest()
    const feedPath = `/api/v1/rss-feed-items?rss_feeds=${feedId}`
    const newsPath = `/api/v1/communities/${community.slug}/news`
    const firstFeed = await request.get(feedPath).expect(200)
    const firstNews = await request.get(newsPath).expect(200)
    expect(firstFeed.body.story_post_ids[story.id]).toBe(postId)
    expect(firstNews.body.story_post_ids[story.id]).toBe(postId)
    expect(firstNews.body.posts[postId]?.privacy).toBe('public')

    const generation = await getAnonymousCacheGeneration()
    enableQueryCapture()
    let queries: ReturnType<typeof stopTestQueryCapture>
    try {
      expect((await request.get(feedPath).expect(200)).body.story_post_ids[story.id]).toBe(postId)
      expect((await request.get(newsPath).expect(200)).body.story_post_ids[story.id]).toBe(postId)
    } finally {
      queries = stopTestQueryCapture()
    }
    const stableGeneration = generation === (await getAnonymousCacheGeneration())
    const mappingQueries = countCapturedQueriesByAnnotation(
      queries,
      'getVisiblePostStoryIdsByStoryIds',
    )
    expect(stableGeneration ? mappingQueries : 0).toBe(0)

    await makeTestPostPrivate(postId)
    await caches.posts.invalidateCacheGetByAny(postId)
    const after = await request.get(newsPath).expect(200)
    expect(after.body.posts[postId]?.privacy).not.toBe('private')
  })
})
