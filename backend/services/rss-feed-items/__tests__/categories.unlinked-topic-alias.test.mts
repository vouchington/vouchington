import { describe, expect, it } from 'vitest'

import { getRssFeedItemCategories, upsertRssFeedItemCategories } from '../categories.mts'
import { clearAllCategoriesForUnlinkedTopicAlias } from '../clear-all-unlinked-topic-alias-categories.mts'
import { getRssFeedItemById } from '../get.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'
import {
  createTestTopic,
  getTestRssFeedItemCategorySnapshotReconciliation,
  getTestRssFeedCategories,
  insertTestRssFeedCategory,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'

describe('unlinked RSS topic alias category cleanup', () => {
  it('re-resolves feed and item categories through an active topic slug after alias unlink', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const sourceTopic = await createTestTopic({
      name: `Source Topic ${random}`,
      slug: `source-topic-${random}`,
    })
    const aliasText = `re-resolve-${random}`
    const [alias] = await createTopicAliases(sourceTopic.id, aliasText)
    const replacementTopic = await createTestTopic({
      name: `Replacement Topic ${random}`,
      slug: aliasText,
    })
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://unlinked-alias-${random}.example.com/feed.xml`,
      title: `Unlinked alias ${random}`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://unlinked-alias-${random}.example.com/re-resolve`,
        guid: `re-resolve-${random}`,
        title: `Re-resolve ${random}`,
      },
    ])
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item!.id, categories: [`#${aliasText}`] },
    ])
    await insertTestRssFeedCategory(feed.id, aliasText, sourceTopic.id)
    await unlinkTopicAlias(alias!.id, { expectedTopicId: sourceTopic.id, skipSideEffects: true })

    await clearAllCategoriesForUnlinkedTopicAlias(alias!.id, aliasText)

    await expect(getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).resolves.toBeDefined()

    await expect(getRssFeedItemCategories(item!.id)).resolves.toContainEqual(
      expect.objectContaining({
        category_text: `#${aliasText}`,
        topic_id: replacementTopic.id,
      }),
    )
    await expect(getRssFeedItemById(item!.id)).resolves.toEqual(
      expect.objectContaining({
        categories: expect.arrayContaining([
          expect.objectContaining({
            hashtag: expect.objectContaining({ key: aliasText, topic_id: null }),
            topic: expect.objectContaining({ id: replacementTopic.id }),
          }),
        ]),
      }),
    )
    await expect(getTestRssFeedCategories(feed.id)).resolves.toContainEqual({
      category_text: aliasText,
      topic_id: replacementTopic.id,
    })
  })
})
