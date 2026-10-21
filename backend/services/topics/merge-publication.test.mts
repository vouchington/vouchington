import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
  createTestRssFeedItemWithUrl,
  addCategoryToRssFeedItem,
  getTestPostPublicationDirtyWorkForScope,
  listTestPostPublicationImpactTopicIds,
} from '@voucha/test-helpers'
import { seedTopicMergeDirectPostCategory } from '@voucha/test-helpers/topic-merge-posts'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'

describe('topic merge publication capture', () => {
  it('retains both topic projections for direct post categories and categories on independently owned RSS feeds', async () => {
    const admin = await createTestUser({ administrator: true })
    const sourceRow = await createTestTopic({ user: admin })
    const destinationRow = await createTestTopic({ user: admin })
    const source = await getTopicByAny(sourceRow.id)
    const destination = await getTopicByAny(destinationRow.id)
    if (!source || !destination) throw new Error('Test topics not found')
    const post = await createTestPost({ user: admin })
    await seedTopicMergeDirectPostCategory(post.id, source.id)
    const feed = await insertTestRssFeedDirect({})
    const item = await createTestRssFeedItemWithUrl(feed.id)
    await addCategoryToRssFeedItem(item.id, source.id, `merge-${crypto.randomUUID()}`)
    await mergeTopicAliases(admin, source, destination)
    const [postWork, feedWork] = await Promise.all([
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id }),
      getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id }),
    ])
    expect(postWork).toBeDefined()
    expect(feedWork).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(postWork!.id)).resolves.toEqual(
      expect.arrayContaining([source.id, destination.id]),
    )
    await expect(listTestPostPublicationImpactTopicIds(feedWork!.id)).resolves.toEqual(
      expect.arrayContaining([source.id, destination.id]),
    )
  })
})
