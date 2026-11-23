import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  addCategoryToRssFeedItem,
  beginTransaction,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUserDirect,
  getPostCategoryTopicIds,
  getPostRelatedUrlIds,
  insertTestRssFeedItem,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
  observeTestPostgresClientQueries,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { upsertSystemUser } from '@services/users/system-users'
import { adminAssignItemToStory } from '../assign.mts'
import { isStoryItem } from '../get.mts'
import { prepareStoryPost } from '../story-posts.mts'
import { drainStoryPostRelatedUrlProjection } from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'

describe('concurrent story post creation and assignment', () => {
  it.each(['assignment first', 'creation first'] as const)(
    'projects the URL and category of a concurrently assigned item with %s',
    async commitOrder => {
      await upsertSystemUser('story-teller')
      const suffix = randomUUID()
      const [user, story, feed, initialUrl, assignedUrl, initialCategory, assignedCategory] =
        await Promise.all([
          createTestUserDirect(),
          insertTestStory({ title: `Concurrent story ${suffix}` }),
          createTestRssFeed({}),
          insertTestUrlDirect(null, `https://initial-${suffix}.example.test/article`),
          insertTestUrlDirect(null, `https://assigned-${suffix}.example.test/article`),
          createTestTopic({ name: `Initial story category ${suffix}` }),
          createTestTopic({ name: `Assigned story category ${suffix}` }),
        ])
      if (!initialUrl || !assignedUrl) throw new Error('Expected story item URLs')

      function insertItem(url: { id: string; url: string }) {
        const itemData = { title: `Story item ${url.id}`, link: url.url }
        return insertTestRssFeedItem({
          rssFeedId: feed.id,
          urlId: url.id,
          guid: url.id,
          itemData,
          contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
        })
      }

      const initialItemId = await insertItem(initialUrl)
      await Promise.all([
        setTestItemStoryId(initialItemId, story.id),
        insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: initialUrl.id, count: 1 }),
        addCategoryToRssFeedItem(initialItemId, initialCategory.id, initialCategory.name),
      ])
      const itemId = await insertItem(assignedUrl)
      await addCategoryToRssFeedItem(itemId, assignedCategory.id, assignedCategory.name)

      await using query = await beginTransaction()
      const prepared = await prepareStoryPost(story.id, user, { query })
      let assignedId: string | null
      if (commitOrder === 'assignment first') {
        assignedId = await adminAssignItemToStory(user.id, story.id, itemId)
        await query.commit()
        await prepared.finalize()
      } else {
        let finalizedDuringAssignment = false
        const { result } = await observeTestPostgresClientQueries(
          () => adminAssignItemToStory(user.id, story.id, itemId),
          async ({ text, values }) => {
            const [storyIds] = values
            if (
              finalizedDuringAssignment ||
              !text.includes('/* getPostStoryIdsByStoryIds */') ||
              !Array.isArray(storyIds) ||
              !storyIds.includes(story.id)
            )
              return

            finalizedDuringAssignment = true
            await query.commit()
            await prepared.finalize()
          },
        )
        if (!finalizedDuringAssignment) throw new Error('Assignment did not read the story post')
        assignedId = result
      }

      expect(assignedId).toBe(itemId)
      const { post } = prepared.response
      await drainStoryPostRelatedUrlProjection(post.id)
      await expect(isStoryItem(story.id, itemId)).resolves.toBe(true)
      const [categoryTopicIds, relatedUrlIds] = await Promise.all([
        getPostCategoryTopicIds(post.id),
        getPostRelatedUrlIds(post.id),
      ])
      expect
        .soft(categoryTopicIds.toSorted())
        .toEqual([initialCategory.id, assignedCategory.id].toSorted())
      expect.soft(relatedUrlIds.toSorted()).toEqual([initialUrl.id, assignedUrl.id].toSorted())
    },
  )

  it('repairs the URL projection when the newest member returns after the work bound was captured', async () => {
    await upsertSystemUser('story-teller')
    const suffix = randomUUID()
    const [user, story, otherStory, feed, initialUrl, newestUrl, category] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Story projection bound ${suffix}` }),
      insertTestStory({ title: `Temporary story ${suffix}` }),
      createTestRssFeed({}),
      insertTestUrlDirect(null, `https://initial-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://newest-${suffix}.example.test/article`),
      createTestTopic({ name: `Newest story category ${suffix}` }),
    ])
    if (!initialUrl || !newestUrl) throw new Error('Expected story item URLs')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: initialUrl.id, count: 2 })
    const itemData = { title: `Newest item ${suffix}`, link: newestUrl.url }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: newestUrl.id,
      guid: suffix,
      itemData,
      contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
    })
    await addCategoryToRssFeedItem(itemId, category.id, category.name)
    await setTestItemStoryId(itemId, story.id)

    let movedItemId: string | null = null
    let returnedItemId: string | null = null
    let projectionPostId: unknown
    const { result: prepared } = await observeTestPostgresClientQueries(
      () => prepareStoryPost(story.id, user),
      async ({ text, values }) => {
        const [firstValue, secondValue] = values
        if (text.includes('/* createStoryPost:items */') && firstValue === story.id) {
          movedItemId = await adminAssignItemToStory(user.id, otherStory.id, itemId)
        }
        if (text.includes('/* markStoryPostRelatedUrlProjection */') && secondValue === story.id) {
          projectionPostId = firstValue
        }
        if (
          text.includes('/* refreshStoryPostRelatedUrlProjectionSources */') &&
          typeof projectionPostId === 'string' &&
          Array.isArray(firstValue) &&
          firstValue.includes(projectionPostId)
        ) {
          returnedItemId = await adminAssignItemToStory(user.id, story.id, itemId)
        }
      },
    )

    expect(movedItemId).toBe(itemId)
    expect(returnedItemId).toBe(itemId)
    await prepared.finalize()
    const { post } = prepared.response
    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(isStoryItem(story.id, itemId)).resolves.toBe(true)
    await expect(getPostCategoryTopicIds(post.id)).resolves.toEqual([category.id])
    const relatedUrlIds = await getPostRelatedUrlIds(post.id)
    expect(relatedUrlIds.toSorted()).toEqual([initialUrl.id, newestUrl.id].toSorted())
  })

  it('preserves the committed assignment and initial projection work when both repairs fail', async () => {
    await upsertSystemUser('story-teller')
    const [user, story, feed, initialUrl] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Story repair failure ${randomUUID()}` }),
      createTestRssFeed({}),
      insertTestUrlDirect(null, `https://repair-${randomUUID()}.example.test/article`),
    ])
    if (!initialUrl) throw new Error('Expected an initial story item URL')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: initialUrl.id, count: 2 })
    const item = await createTestRssFeedItemWithUrl(feed.id)

    await using query = await beginTransaction()
    const prepared = await prepareStoryPost(story.id, user, { query })
    const createRepairError = new Error('Injected story post creation repair failure')
    const assignmentRepairError = new Error('Injected story assignment repair failure')
    const restoreCreationRepair = rejectPostgresWriteForTest(
      '/* storyPostCreationSourcesChanged */',
      createRepairError,
      ([storyId]) => storyId === story.id,
    )
    let assignmentReadAssociation = false
    try {
      const { result: assignedId } = await observeTestPostgresClientQueries(
        () => adminAssignItemToStory(user.id, story.id, item.id),
        async ({ text, values }) => {
          const [storyScope] = values
          if (
            !text.includes('/* getPostStoryIdsByStoryIds */') ||
            !Array.isArray(storyScope) ||
            !storyScope.includes(story.id)
          )
            return
          if (assignmentReadAssociation) throw assignmentRepairError

          assignmentReadAssociation = true
          await query.commit()
          await prepared.finalize()
        },
      )
      expect(assignedId).toBe(item.id)
    } finally {
      restoreCreationRepair()
    }

    expect(sentryCaptureExceptionMock.mock.calls.map(([error]) => error)).toEqual(
      expect.arrayContaining([createRepairError, assignmentRepairError]),
    )
    await expect(isStoryItem(story.id, item.id)).resolves.toBe(true)
    const { post } = prepared.response
    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([initialUrl.id])
  })
})
