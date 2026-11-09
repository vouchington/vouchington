import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  addCategoryToRssFeedItem,
  createTestTopic,
  createTestUrlWithHostname,
  createTestUser,
  getEntityRelation,
  insertTestRssFeedItem,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { mergeTopicIdsForTest } from '@voucha/test-helpers/merge-topics'
import {
  countTestStoryCategoryReceipts,
  countTestStoryCategoryWork,
  deleteTestStoryCategoryWork,
} from '@voucha/test-helpers/story-category-projection-fixtures'
import { upsertSystemUser } from '@services/users/system-users'
import { prepareStoryPost } from '../story-posts.mts'
import { reconcileStoryPostCategoryProjection } from '../story-post-category-projection.mts'

describe('story category projection and topic merge', () => {
  it('restarts a partially observed source topic and keeps its merged destination', async () => {
    await upsertSystemUser('story-teller')
    const user = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user })
    const destination = await createTestTopic({ user })
    const feed = await createTestRssFeed({})
    const urlId = await createTestUrlWithHostname()
    const story = await insertTestStory({})
    async function makeItem() {
      const guid = randomUUID()
      const data = { title: guid, link: `https://example.test/${guid}` }
      const id = await insertTestRssFeedItem({
        rssFeedId: feed.id,
        urlId,
        guid,
        itemData: data,
        contentSha256: createHash('sha256').update(JSON.stringify(data)).digest(),
      })
      await setTestItemStoryId(id, story.id)
      return id
    }
    const [first] = await Promise.all([makeItem(), makeItem()])
    await addCategoryToRssFeedItem(first!, source.id)
    const prepared = await prepareStoryPost(story.id, user)
    const postId = prepared.response.post.id
    try {
      for (let page = 0; page < 2; page++) {
        expect(
          (await reconcileStoryPostCategoryProjection({ storyIds: [story.id], batchSize: 1 }))
            .continue,
        ).toBe(true)
      }
      expect(await countTestStoryCategoryReceipts(story.id, source.id)).toBe(1)
      await mergeTopicIdsForTest(user, source.id, destination.id)
      expect(await countTestStoryCategoryReceipts(story.id, source.id)).toBe(0)
      expect(await countTestStoryCategoryWork([story.id])).toBe(1)
      for (let page = 0; page < 20; page++) {
        const result = await reconcileStoryPostCategoryProjection({
          storyIds: [story.id],
          batchSize: 1,
        })
        if (!result.continue) break
        if (page === 19) throw new Error('Merged story category projection did not finish')
      }
      expect(
        await getEntityRelation('relation__post__category__topic', postId, source.id),
      ).toHaveLength(0)
      expect(
        await getEntityRelation('relation__post__category__topic', postId, destination.id),
      ).toMatchObject([{ deleted_at: null }])
    } finally {
      await deleteTestStoryCategoryWork([story.id])
    }
  })
})
