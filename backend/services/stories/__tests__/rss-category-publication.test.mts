import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestTopic,
  createTestTopicAliasForCategoryMapping,
  createTestUrlWithHostname,
  createTestUserDirect,
  countTestStoryPostPublicationDirtyWork,
  deleteTestPostStory,
  getTopicAliasIdForTest,
  getTestPostPublicationDirtyWorkForScope,
  insertTestPost,
  insertTestPostStoryAndWaitBeforeCommit,
  insertTestRssFeedItem,
  insertTestStoryCategoryPublicationBatch,
  insertTestStory,
  insertTestTopicBatch,
  isTestStoryLifecycleLockWaiting,
  listTestPostPublicationImpactPostIds,
  listTestPostPublicationImpactTopicIds,
  setTestItemStoryId,
  updateTestTopicAliasCategoryMappingOwner,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { upsertSystemAdministrator } from '@services/users/system-users'
import type { PrivateUser } from '@services/users/types'
import {
  backfillCategoriesForTopicAliases,
  clearCategoriesForUnlinkedTopicAlias,
  upsertRssFeedItemCategories,
} from '@services/rss-feed-items/categories'
import { createStoryPost } from '../story-posts.mts'
import { recordTestStoryTopicPublicationChange } from '@services/post-publication/test-fixtures'

let feedId: string
let urlId: string
let user: PrivateUser

function sha256(value: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(value)).digest()
}

async function createStoryPostWithItems() {
  const story = await insertTestStory({ title: `RSS category story ${Math.random()}` })
  const itemIds = await Promise.all(
    Array.from({ length: 2 }, async (_, index) => {
      const suffix = `${Math.random()}-${index}`
      const data = { title: `RSS category item ${suffix}`, link: `https://example.com/${suffix}` }
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId,
        guid: `rss-category-story-${suffix}`,
        itemData: data,
        contentSha256: sha256(data),
      })
      await setTestItemStoryId(itemId, story.id)
      return itemId
    }),
  )
  const { post } = await createStoryPost(story.id, user)
  return { itemIds, postId: post.id, story }
}

async function createStoryItemWithoutPost() {
  const story = await insertTestStory({ title: `RSS category no-post story ${Math.random()}` })
  const suffix = Math.random().toString(36).slice(2)
  const data = {
    title: `RSS category no-post item ${suffix}`,
    link: `https://example.com/${suffix}`,
  }
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId,
    guid: `rss-category-no-post-${suffix}`,
    itemData: data,
    contentSha256: sha256(data),
  })
  await setTestItemStoryId(itemId, story.id)
  return { itemId, story }
}

describe('RSS category story-post publication', () => {
  beforeAll(async () => {
    await upsertSystemAdministrator('story-teller')
    const [feed, createdUrlId, createdUser] = await Promise.all([
      createTestRssFeed({}),
      createTestUrlWithHostname(),
      createTestUserDirect(),
    ])
    feedId = feed.id
    urlId = createdUrlId
    user = createdUser!
  })

  it('captures a story scope when category insertion maps a topic', async () => {
    const { itemIds, story } = await createStoryPostWithItems()
    const topic = await createTestTopic({ user })
    const alias = `rss-category-insert-${Math.random().toString(36).slice(2)}`
    await createTestTopicAliasForCategoryMapping({ alias, topicId: topic.id })

    await upsertRssFeedItemCategories([{ rss_feed_item_id: itemIds[0]!, categories: [alias] }])

    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'story', id: story.id }),
    ).resolves.toMatchObject({ story_id: story.id })
  })

  it('retains category topic impacts for a story that has no discussion post', async () => {
    const { itemId, story } = await createStoryItemWithoutPost()
    const [firstTopic, secondTopic] = await Promise.all([
      createTestTopic({ user }),
      createTestTopic({ user }),
    ])
    const alias = `rss-category-no-post-${Math.random().toString(36).slice(2)}`
    const aliasId = await createTestTopicAliasForCategoryMapping({
      alias,
      topicId: firstTopic.id,
    })

    await upsertRssFeedItemCategories([{ rss_feed_item_id: itemId, categories: [alias] }])

    const inserted = await getTestPostPublicationDirtyWorkForScope({
      type: 'story',
      id: story.id,
    })
    expect(inserted).toBeDefined()
    await expect(listTestPostPublicationImpactPostIds(inserted!.id)).resolves.toEqual([])
    await expect(listTestPostPublicationImpactTopicIds(inserted!.id)).resolves.toEqual([
      firstTopic.id,
    ])

    await updateTestTopicAliasCategoryMappingOwner(aliasId, secondTopic.id)
    await backfillCategoriesForTopicAliases(secondTopic.id)
    await updateTestTopicAliasCategoryMappingOwner(aliasId, null)
    await clearCategoriesForUnlinkedTopicAlias(aliasId, secondTopic.id)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'story', id: story.id })
    expect(work).toBeDefined()
    await expect(listTestPostPublicationImpactPostIds(work!.id)).resolves.toEqual([])
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual(
      expect.arrayContaining([firstTopic.id, secondTopic.id]),
    )
  })

  it('retains the story post when its mapping disappears after capture', async () => {
    const { itemIds, story } = await createStoryPostWithItems()
    const topic = await createTestTopic({ user })
    const alias = `rss-category-retain-post-${Math.random().toString(36).slice(2)}`
    await createTestTopicAliasForCategoryMapping({ alias, topicId: topic.id })

    await upsertRssFeedItemCategories([{ rss_feed_item_id: itemIds[0]!, categories: [alias] }])
    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'story', id: story.id })
    expect(work).toBeDefined()
    const [postId] = await listTestPostPublicationImpactPostIds(work!.id)
    expect(postId).toBeDefined()

    await deleteTestPostStory(postId!)
    await expect(listTestPostPublicationImpactPostIds(work!.id)).resolves.toEqual([postId])
  })

  it('captures a story scope when an alias backfill maps a topic', async () => {
    const { itemIds, story } = await createStoryPostWithItems()
    const alias = `rss-category-backfill-${Math.random().toString(36).slice(2)}`
    await upsertRssFeedItemCategories([{ rss_feed_item_id: itemIds[0]!, categories: [alias] }])
    const topic = await createTestTopic({ user })
    const aliasId = await getTopicAliasIdForTest(alias)
    expect(aliasId).not.toBeNull()
    await updateTestTopicAliasCategoryMappingOwner(aliasId!, topic.id)

    await backfillCategoriesForTopicAliases(topic.id)

    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'story', id: story.id }),
    ).resolves.toMatchObject({ story_id: story.id })
  })

  it('captures a story scope when an alias unlink clears a topic', async () => {
    const topic = await createTestTopic({ user })
    const alias = `rss-category-clear-${Math.random().toString(36).slice(2)}`
    const topicAliasId = await createTestTopicAliasForCategoryMapping({ alias, topicId: topic.id })
    const { itemIds, story } = await createStoryPostWithItems()
    await upsertRssFeedItemCategories([{ rss_feed_item_id: itemIds[0]!, categories: [alias] }])
    await updateTestTopicAliasCategoryMappingOwner(topicAliasId, null)

    await clearCategoriesForUnlinkedTopicAlias(topicAliasId, topic.id)

    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'story', id: story.id }),
    ).resolves.toMatchObject({ story_id: story.id })
  })

  it('re-reads a story-post association committed by concurrent story creation', async () => {
    const story = await insertTestStory({ title: `Concurrent story ${Math.random()}` })
    const suffix = Math.random().toString(36).slice(2)
    const data = { title: `Concurrent item ${suffix}`, link: `https://example.com/${suffix}` }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `rss-category-concurrent-${suffix}`,
      itemData: data,
      contentSha256: sha256(data),
    })
    await setTestItemStoryId(itemId, story.id)
    const postId = await insertTestPost({
      title: `Concurrent story post ${suffix}`,
      slug: `concurrent-story-post-${suffix}`,
      createdById: user.id,
      markdown: '',
      postType: 'story',
    })
    const topic = await createTestTopic({ user })
    const alias = `rss-category-concurrent-${suffix}`
    await createTestTopicAliasForCategoryMapping({ alias, topicId: topic.id })
    const releaseCreation = Promise.withResolvers<void>()
    const associationInserted = Promise.withResolvers<void>()
    const creating = insertTestPostStoryAndWaitBeforeCommit(
      postId,
      story.id,
      user.id,
      releaseCreation.promise,
      associationInserted.resolve,
    )
    let capturing: Promise<void> | undefined
    try {
      await associationInserted.promise
      capturing = upsertRssFeedItemCategories([{ rss_feed_item_id: itemId, categories: [alias] }])
      await vi.waitFor(async () => {
        await expect(isTestStoryLifecycleLockWaiting(story.id)).resolves.toBe(true)
      })
      releaseCreation.resolve()
      await Promise.all([creating, capturing])
      await expect(
        getTestPostPublicationDirtyWorkForScope({ type: 'story', id: story.id }),
      ).resolves.toMatchObject({ story_id: story.id })
    } finally {
      releaseCreation.resolve()
      await creating.catch(() => undefined)
      await capturing?.catch(() => undefined)
    }
  })

  it('captures the full 500-row category writer batch without per-story loops', async () => {
    const topic = await createTestTopic({ user })
    const { storyIds } = await insertTestStoryCategoryPublicationBatch({
      count: 500,
      categoryText: topic.name,
      createdById: user.id,
      rssFeedId: feedId,
      topicId: null,
      urlId,
    })

    await expect(backfillCategoriesForTopicAliases(topic.id)).resolves.toEqual({ updated: 500 })
    await expect(countTestStoryPostPublicationDirtyWork(storyIds)).resolves.toBe(500)
  })

  it('chunks more than 1000 retained topic impacts for one story', async () => {
    const { postId, story } = await createStoryPostWithItems()
    const prefix = `publication-impact-${Math.random().toString(36).slice(2)}`
    const topicIds = await insertTestTopicBatch({ count: 1001, createdById: user.id, prefix })

    await recordTestStoryTopicPublicationChange({
      storyId: story.id,
      impactedPostIds: [postId],
      impactedTopicIds: topicIds,
    })
    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'story', id: story.id })
    expect(work).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toHaveLength(1001)
  })
})
