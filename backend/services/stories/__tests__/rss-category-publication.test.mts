import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestTopic,
  createTestTopicAliasForCategoryMapping,
  createTestUrlWithHostname,
  createTestUserDirect,
  deleteTestPostStory,
  getTopicAliasIdForTest,
  insertTestPost,
  insertTestPostStoryAndWaitBeforeCommit,
  insertTestRssFeedItem,
  insertTestStoryCategoryPublicationBatch,
  insertTestStory,
  insertTestTopicBatch,
  setTestItemStoryId,
  updateTestTopicAliasCategoryMappingOwner,
  beginTransaction,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { upsertSystemUser } from '@services/users/system-users'
import type { PrivateUser } from '@services/users/types'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { backfillCategoriesForTopicAliases } from '@services/rss-feed-items/backfill-categories-for-topic-aliases'
import { clearCategoriesForUnlinkedTopicAlias } from '@services/rss-feed-items/clear-topic-alias-categories'
import * as storyLifecycleLock from '@services/post-publication/story-lifecycle-lock'
import { prepareStoryPost } from '../story-posts.mts'
import { recordTestStoryTopicPublicationChange } from '@voucha/test-helpers/post-publication-fixtures'
import {
  captureAddedPublicationEffectsForScope,
  captureAddedPublicationEffectsForScopes,
} from '@voucha/test-helpers/publication-effect-jobs'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'

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
  const prepared = await prepareStoryPost(story.id, user)
  await prepared.finalize()
  const { post } = prepared.response
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
    await upsertSystemUser('story-teller')
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

    const jobs = await captureAddedPublicationEffectsForScope(story.id, () =>
      upsertRssFeedItemCategories([{ rss_feed_item_id: itemIds[0]!, categories: [alias] }]),
    )
    expect(jobs.flatMap(job => job.keys)).toContainEqual({
      kind: 'impact_topic',
      uuidValue: topic.id,
    })
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

    const inserted = await captureAddedPublicationEffectsForScope(story.id, () =>
      upsertRssFeedItemCategories([{ rss_feed_item_id: itemId, categories: [alias] }]),
    )
    expect(inserted.flatMap(job => job.keys)).toContainEqual({
      kind: 'impact_topic',
      uuidValue: firstTopic.id,
    })
    expect(inserted.flatMap(job => job.keys).filter(key => key.kind === 'impact_post')).toEqual([])

    const changed = await captureAddedPublicationEffectsForScope(story.id, async () => {
      await updateTestTopicAliasCategoryMappingOwner(aliasId, secondTopic.id)
      await backfillCategoriesForTopicAliases(secondTopic.id)
      await updateTestTopicAliasCategoryMappingOwner(aliasId, null)
      await clearCategoriesForUnlinkedTopicAlias(aliasId, secondTopic.id)
    })
    expect(changed.flatMap(job => job.keys)).toEqual(
      expect.arrayContaining([
        { kind: 'impact_topic', uuidValue: firstTopic.id },
        { kind: 'impact_topic', uuidValue: secondTopic.id },
      ]),
    )
  })

  it('retains the story post when its mapping disappears after capture', async () => {
    const { itemIds, postId, story } = await createStoryPostWithItems()
    const topic = await createTestTopic({ user })
    const alias = `rss-category-retain-post-${Math.random().toString(36).slice(2)}`
    await createTestTopicAliasForCategoryMapping({ alias, topicId: topic.id })

    const jobs = await captureAddedPublicationEffectsForScope(story.id, () =>
      upsertRssFeedItemCategories([{ rss_feed_item_id: itemIds[0]!, categories: [alias] }]),
    )
    expect(jobs.flatMap(job => job.keys)).toContainEqual({ kind: 'impact_post', uuidValue: postId })
    await deleteTestPostStory(postId)
    expect(jobs.flatMap(job => job.keys)).toContainEqual({ kind: 'impact_post', uuidValue: postId })
  })

  it('captures a story scope when an alias backfill maps a topic', async () => {
    const { itemIds, story } = await createStoryPostWithItems()
    const alias = `rss-category-backfill-${Math.random().toString(36).slice(2)}`
    await upsertRssFeedItemCategories([{ rss_feed_item_id: itemIds[0]!, categories: [alias] }])
    const topic = await createTestTopic({ user })
    const aliasId = await getTopicAliasIdForTest(alias)
    expect(aliasId).not.toBeNull()
    await updateTestTopicAliasCategoryMappingOwner(aliasId!, topic.id)

    const jobs = await captureAddedPublicationEffectsForScope(story.id, () =>
      backfillCategoriesForTopicAliases(topic.id),
    )
    expect(jobs.flatMap(job => job.keys)).toContainEqual({
      kind: 'impact_topic',
      uuidValue: topic.id,
    })
  })

  it('captures a story scope when an alias unlink clears a topic', async () => {
    const topic = await createTestTopic({ user })
    const alias = `rss-category-clear-${Math.random().toString(36).slice(2)}`
    const topicAliasId = await createTestTopicAliasForCategoryMapping({ alias, topicId: topic.id })
    const { itemIds, story } = await createStoryPostWithItems()
    await upsertRssFeedItemCategories([{ rss_feed_item_id: itemIds[0]!, categories: [alias] }])
    await updateTestTopicAliasCategoryMappingOwner(topicAliasId, null)

    const jobs = await captureAddedPublicationEffectsForScope(story.id, () =>
      clearCategoriesForUnlinkedTopicAlias(topicAliasId, topic.id),
    )
    expect(jobs.flatMap(job => job.keys)).toContainEqual({
      kind: 'impact_topic',
      uuidValue: topic.id,
    })
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
    let capturing: Promise<PostPublicationEffectsJobData[]> | undefined
    try {
      await associationInserted.promise
      const lockStories = storyLifecycleLock.lockStoryLifecycles
      const entered = Promise.withResolvers<void>()
      const lifecycleSpy = vi
        .spyOn(storyLifecycleLock, 'lockStoryLifecycles')
        .mockImplementation((query, storyIds) => {
          if (storyIds.includes(story.id)) entered.resolve()
          return lockStories(query, storyIds)
        })
      capturing = captureAddedPublicationEffectsForScope(story.id, () =>
        upsertRssFeedItemCategories([{ rss_feed_item_id: itemId, categories: [alias] }]),
      )
      try {
        await entered.promise
        await using probe = await beginTransaction()
        await probe(`/* testRssCategoryPublication */ SET LOCAL lock_timeout = '50ms'`)
        await expect(lockStories(probe, [story.id])).rejects.toMatchObject({ code: '55P03' })
      } finally {
        lifecycleSpy.mockRestore()
      }
      releaseCreation.resolve()
      const [, jobs] = await Promise.all([creating, capturing])
      expect(jobs.flatMap(job => job.keys)).toContainEqual({
        kind: 'impact_post',
        uuidValue: postId,
      })
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
    const jobs = await captureAddedPublicationEffectsForScopes(storyIds, () =>
      expect(backfillCategoriesForTopicAliases(topic.id)).resolves.toEqual({
        updated: 500,
        hasMore: true,
      }),
    )
    expect(new Set(jobs.map(job => job.scope.id)).size).toBe(500)
  })

  it('chunks more than 1000 retained topic impacts for one story', async () => {
    const { postId, story } = await createStoryPostWithItems()
    const prefix = `publication-impact-${Math.random().toString(36).slice(2)}`
    const topicIds = await insertTestTopicBatch({ count: 1001, createdById: user.id, prefix })

    const jobs = await captureAddedPublicationEffectsForScope(story.id, () =>
      recordTestStoryTopicPublicationChange({
        storyId: story.id,
        impactedPostIds: [postId],
        impactedTopicIds: topicIds,
      }),
    )
    expect(
      new Set(
        jobs.flatMap(job =>
          job.keys.flatMap(key => (key.kind === 'impact_topic' ? [key.uuidValue] : [])),
        ),
      ).size,
    ).toBe(1001)
  })
})
