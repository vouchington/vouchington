import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
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
import { createRequest } from '@voucha/test-helpers/api/server'
import { makeTestPostPrivate } from '@voucha/test-helpers/post-write-context'
import { getVisiblePostStoryIdsByStoryIds } from '@services/stories/get-post-stories'
import { createPostStory } from '@services/stories/update'

describe('anonymous community news story posts', () => {
  it('omits a stale cached story mapping when the first body fill finds a private post', async () => {
    const author = await createTestUser()
    const topic = await createTestTopic({ user: author })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const story = await insertTestStory({ title: `News story ${randomUUID()}` })
    await setTestItemStoryId(item.id, story.id)
    const postId = await insertTestPost({
      title: 'Private before first news body fill',
      slug: `news-story-private-${randomUUID()}`,
      createdById: author.id,
      markdown: '',
      postType: 'story',
    })
    await createPostStory(postId, story.id, author.id)
    const community = await insertTestCommunity({
      createdById: author.id,
      slug: `news-story-cache-${randomUUID()}`,
    })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: feedId,
    })
    expect((await getVisiblePostStoryIdsByStoryIds(null, [story.id]))[story.id]).toBe(postId)

    await makeTestPostPrivate(postId)
    const response = await createRequest()
      .get(`/api/v1/communities/${community.slug}/news`)
      .expect(200)
    expect(response.body.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity_id: item.id })]),
    )
    expect(response.body.story_post_ids).not.toHaveProperty(story.id)
    expect(response.body.posts).not.toHaveProperty(postId)
    expect(response.body.posts_metrics).not.toHaveProperty(postId)
  })
})
