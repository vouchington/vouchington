import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  insertTestPost,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { getPostByAnyCached } from '@services/posts/get-cached'
import { makeTestPostPrivate } from '@voucha/test-helpers/post-write-context'
import { createPostStory } from './update.mts'
import { getVisiblePostStoryIdsByStoryIds } from './get-post-stories.mts'
import { getStoryPageRelatedPosts } from './story-page-related-posts.mts'

describe('anonymous story page post hydration', () => {
  it('omits stale story mapping and metrics when the first body fill finds a private post', async () => {
    const author = await createTestUser()
    const story = await insertTestStory({ title: `Stale story map ${randomUUID()}` })
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    await setTestItemStoryId(item.id, story.id)
    const postId = await insertTestPost({
      title: 'Private before first story body fill',
      slug: `story-page-private-${randomUUID()}`,
      createdById: author.id,
      markdown: '',
      postType: 'story',
    })
    await createPostStory(postId, story.id, author.id)
    expect((await getVisiblePostStoryIdsByStoryIds(null, [story.id]))[story.id]).toBe(postId)

    await makeTestPostPrivate(postId)
    const result = await getStoryPageRelatedPosts(null, story.id, [])
    expect(result.story_post_ids).not.toHaveProperty(story.id)
    expect(result.posts).not.toHaveProperty(postId)
    expect(result.posts_metrics).not.toHaveProperty(postId)
  })

  it('does not combine a cached public story mapping with a refreshed private post body', async () => {
    const author = await createTestUser()
    const story = await insertTestStory({ title: 'Story page cached body' })
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    await setTestItemStoryId(item.id, story.id)
    const postId = await insertTestPost({
      title: 'Story page post',
      slug: `story-page-${randomUUID()}`,
      createdById: author.id,
      markdown: '',
      postType: 'story',
    })
    await createPostStory(postId, story.id, author.id)
    const first = await getStoryPageRelatedPosts(null, story.id, [])
    expect(first.story_post_ids[story.id]).toBe(postId)
    expect(first.posts[postId]?.privacy).toBe('public')

    await makeTestPostPrivate(postId)
    await caches.posts.invalidateCacheGetByAny(postId)
    expect((await getPostByAnyCached(postId))?.privacy).toBe('private')
    const second = await getStoryPageRelatedPosts(null, story.id, [])
    expect(second.posts[postId]?.privacy).not.toBe('private')
  })
})
