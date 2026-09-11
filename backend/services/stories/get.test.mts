import { randomUUID, createHash } from 'node:crypto'
import { it, expect, beforeAll, describe } from 'vitest'
import {
  getStoryById,
  getStoryWithItemCount,
  getStoryItemIds,
  getStoriesByIdBatch,
  getItemIdsByStoryIds,
  getStoryItemSummaries,
} from './get.mts'
import { getPostStoryIdsByStoryIds, getVisiblePostStoryIdsByStoryIds } from './get-post-stories.mts'
import { createStory } from './create.mts'
import {
  insertTestStory,
  insertTestPost,
  createTestUserDirect,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  setTestItemStoryId,
  archivePostForTopHashtagTest,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { createPostStory } from './update.mts'

describe('get', () => {
  let story1: Awaited<ReturnType<typeof insertTestStory>>
  let story2: Awaited<ReturnType<typeof insertTestStory>>

  beforeAll(async () => {
    ;[story1, story2] = await Promise.all([
      insertTestStory({ title: 'Story One' }),
      insertTestStory({ title: 'Story Two' }),
    ])
  })

  it('getStoryById returns story by id', async () => {
    const story = await getStoryById(story1.id)
    expect(story).toBeDefined()
    expect(story!.id).toBe(story1.id)
    expect(story!.title).toBe('Story One')
  })

  it('getStoryById returns null for unknown id', async () => {
    const story = await getStoryById(randomUUID())
    expect(story).toBeNull()
  })

  it('createStory creates a story with nulls', async () => {
    const story = await createStory()
    expect(story.id).toBeTruthy()
    expect(story.title).toBeNull()
    expect(story.cluster_reason).toBeNull()
    expect(story.official_rss_feed_item_id).toBeNull()
    expect(story.official_locked_at).toBeNull()
    expect(story.deleted_at).toBeNull()
  })

  it('createStory stores and returns cluster_reason', async () => {
    const reason = 'Both articles cover the same product launch event'
    const story = await createStory({ title: 'Cluster Reason Test', cluster_reason: reason })
    expect(story.cluster_reason).toBe(reason)

    const fetched = await getStoryById(story.id)
    expect(fetched!.cluster_reason).toBe(reason)
  })

  it('getStoryWithItemCount returns item_count for empty story', async () => {
    const newStory = await insertTestStory({ title: 'Item Count Test' })
    const result = await getStoryWithItemCount(newStory.id)
    expect(result).toBeDefined()
    expect(result!.item_count).toBe(0)
  })

  it('getStoryWithItemCount returns null for unknown id', async () => {
    const result = await getStoryWithItemCount(randomUUID())
    expect(result).toBeNull()
  })

  it('getStoryItemIds returns empty array for story with no items', async () => {
    const newStory = await insertTestStory()
    const ids = await getStoryItemIds(newStory.id)
    expect(ids).toEqual([])
  })

  it('getStoryItemSummaries falls back to media descriptions', async () => {
    const [feed, urlId, story] = await Promise.all([
      createTestRssFeed({}),
      createTestUrlWithHostname(),
      insertTestStory({ title: 'Media Summary Story' }),
    ])
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = {
      guid: `media-summary-${random}`,
      title: `Media Summary Item ${random}`,
      link: `https://example.com/media-summary-${random}`,
      contentSnippet: '<p>&#xA0;</p>',
      'media:description': 'Story summary from YouTube media description.',
    }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: itemData.guid,
      itemData,
      contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
    })
    await setTestItemStoryId(itemId, story.id)

    await expect(getStoryItemSummaries(story.id)).resolves.toContainEqual({
      title: itemData.title,
      summary: 'Story summary from YouTube media description.',
    })
  })

  it('getStoriesByIdBatch returns null for unknown ids', async () => {
    const results = await getStoriesByIdBatch([randomUUID(), randomUUID()])
    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]).toBeNull()
  })

  it('getStoriesByIdBatch preserves order', async () => {
    const results = await getStoriesByIdBatch([story2.id, story1.id])
    expect(results[0]!.id).toBe(story2.id)
    expect(results[1]!.id).toBe(story1.id)
  })

  it('getStoriesByIdBatch returns empty array for empty input', async () => {
    const results = await getStoriesByIdBatch([])
    expect(results).toEqual([])
  })

  it('getItemIdsByStoryIds returns empty for unknown ids', async () => {
    const result = await getItemIdsByStoryIds([randomUUID()])
    expect(result).toEqual({})
  })

  it('getItemIdsByStoryIds returns empty for empty input', async () => {
    const result = await getItemIdsByStoryIds([])
    expect(result).toEqual({})
  })
})

describe('getPostStoryIdsByStoryIds', () => {
  let feedId: string
  let urlId: string

  beforeAll(async () => {
    const [feed, testUrlId] = await Promise.all([
      createTestRssFeed({}),
      createTestUrlWithHostname(),
    ])
    feedId = feed.id
    urlId = testUrlId
  })

  async function insertItemForStory(storyId: string): Promise<string> {
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Test Article ${random}`, link: `https://example.com/${random}` }
    const contentSha256 = createHash('sha256').update(JSON.stringify(itemData)).digest()
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `get-test-${random}`,
      itemData,
      contentSha256,
    })
    await setTestItemStoryId(itemId, storyId)
    return itemId
  }

  it('returns empty record for empty input', async () => {
    const result = await getPostStoryIdsByStoryIds([])
    expect(result).toEqual({})
  })

  it('returns correct mapping for an existing story-post link', async () => {
    const testUser = await createTestUserDirect()
    const story = await insertTestStory({ title: 'Post Story Mapping Test' })
    await insertItemForStory(story.id)

    const postId = await insertTestPost({
      title: 'Post Story Mapping Test Post',
      slug: randomUUID(),
      createdById: testUser!.id,
      markdown: '',
      postType: 'story',
    })
    await createPostStory(postId, story.id, testUser!.id)
    const result = await getPostStoryIdsByStoryIds([story.id])

    expect(result[story.id]).toBe(postId)
  })

  it('returns only stories that have a post__stories record (missing ones absent)', async () => {
    const testUser = await createTestUserDirect()
    const storyWithPost = await insertTestStory({ title: 'Story With Post' })
    const storyWithoutPost = await insertTestStory({ title: 'Story Without Post' })
    await insertItemForStory(storyWithPost.id)

    const postId = await insertTestPost({
      title: 'Story With Post Post',
      slug: randomUUID(),
      createdById: testUser!.id,
      markdown: '',
      postType: 'story',
    })
    await createPostStory(postId, storyWithPost.id, testUser!.id)
    const result = await getPostStoryIdsByStoryIds([storyWithPost.id, storyWithoutPost.id])

    expect(result[storyWithPost.id]).toBe(postId)
    expect(result[storyWithoutPost.id]).toBeUndefined()
    expect(Object.keys(result)).toHaveLength(1)
  })

  it('returns empty record when no stories have post__stories records', async () => {
    const story = await insertTestStory({ title: 'No Post Story' })
    const result = await getPostStoryIdsByStoryIds([story.id, randomUUID()])
    expect(result).toEqual({})
  })

  it('does not expose stale archived story-post mappings to anonymous readers', async () => {
    const testUser = await createTestUserDirect()
    const story = await insertTestStory({ title: 'Archived Story Post' })
    await insertItemForStory(story.id)
    const postId = await insertTestPost({
      title: 'Archived Story Post',
      slug: randomUUID(),
      createdById: testUser!.id,
      markdown: '',
      postType: 'story',
    })
    await createPostStory(postId, story.id, testUser!.id)
    await archivePostForTopHashtagTest(postId, testUser!.id)

    await expect(getVisiblePostStoryIdsByStoryIds(null, [story.id])).resolves.toEqual({})
  })
})
