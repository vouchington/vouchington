import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  deleteTestStoryPostProjectionJob,
  getTestRssFeedUrlHostnameId,
  getTestStoryPostProjectionGeneration,
  insertTestStoryPostProjectionJob,
  insertTestPost,
  insertTestPostStory,
  insertTestRssFeedDirect,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { getRssFeedItemById } from '../get.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { getExistingRssFeedItems } from '../upsert-existing.mts'
import type { ExistingRssFeedItemRow } from '../upsert-queries.mts'

describe('RSS URL revision upsert writer state', () => {
  it('restarts the story projection when a replica still reports the returning URL', async () => {
    const suffix = crypto.randomUUID()
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    const feed = await insertTestRssFeedDirect({})
    const story = await insertTestStory({ title: `writer URL revision ${suffix}` })
    const postId = await insertTestPost({
      createdById: user.id,
      markdown: '',
      postType: 'story',
      slug: `rss-url-writer-revision-${suffix}`,
      title: `RSS URL writer revision ${suffix}`,
    })
    await insertTestPostStory(postId, story.id, user.id)
    await insertTestStoryPostProjectionJob(postId, story.id)
    try {
      const initialInput = {
        guid: `writer-url-revision-${suffix}`,
        link: `https://writer-url-revision-${suffix}.example.com/a`,
        title: 'Original item',
      }
      const [item] = await upsertRssFeedItems(feed.id, [initialInput])
      await setTestItemStoryId(item.id, story.id)
      await expect(getTestStoryPostProjectionGeneration(postId)).resolves.toBe(1)

      const original = await getRssFeedItemById(item.id)
      if (!original) throw new Error('Expected original RSS feed item')
      const staleRows = await getExistingRows(feed.id, initialInput.guid)
      expect(staleRows).toHaveLength(1)

      await upsertRssFeedItems(feed.id, [
        { ...initialInput, link: `https://writer-url-revision-${suffix}.example.com/b` },
      ])
      const revised = await getRssFeedItemById(item.id)
      if (!revised) throw new Error('Expected revised RSS feed item')
      await expect(getTestStoryPostProjectionGeneration(postId)).resolves.toBe(2)

      await upsertRssFeedItems(feed.id, [initialInput], {
        getExistingRssFeedItems: async () => staleRows,
      })

      const returned = await getRssFeedItemById(item.id)
      if (!returned) throw new Error('Expected returned RSS feed item')
      expect(returned.url.id).toBe(original.url.id)
      expect(returned.url.id).not.toBe(revised.url.id)
      await expect(getTestStoryPostProjectionGeneration(postId)).resolves.toBe(3)
    } finally {
      await deleteTestStoryPostProjectionJob(postId)
    }
  })
})

async function getExistingRows(rssFeedId: string, guid: string): Promise<ExistingRssFeedItemRow[]> {
  const urlHostnameId = await getTestRssFeedUrlHostnameId(rssFeedId)
  return getExistingRssFeedItems(rssFeedId, urlHostnameId, [guid])
}
