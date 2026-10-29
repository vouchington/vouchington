import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import { describe, expect, it } from 'vitest'

import { upsertRssFeedItemCategories } from '../categories.mts'
import {
  beginTransaction,
  createTestUser,
  finishTopicAliasUnlinkForTest,
  createTestTopic,
  getTestRssFeedItemCategorySnapshotReconciliation,
  getTestRssFeedCategories,
  insertTestRssFeedCategory,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { getTopicMergeNativeCheckpoint } from '@voucha/test-helpers/topic-merge-native-operation'
import { registerTestRssCategoryIdentity } from '@voucha/test-helpers/entities/rss-category-identities'
import { createTopicMergeOperation } from '@services/topics/merge-operations'
import { lockTopicMergeLifecycles } from '@services/topics/merge-preflight'
import { processTopicMergeOperationPage } from '@services/topics/merge-operation-page'
import { topicMergePlainPages } from '@services/topics/merge-reference-page-inventory'
import { getTopicByAny } from '@services/topics/get'
import { settleTopicMergeOperationForTest } from '@voucha/test-helpers/merge-topics'
import { clearUnlinkedTopicAliasFeedPage } from '../clear-unlinked-topic-alias-feed-categories.mts'
import { clearUnlinkedTopicAliasItemPage } from '../clear-unlinked-topic-alias-categories.mts'
import { upsertRssFeedCategories } from '../../rss-feeds/categories.mts'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'
import { getRssFeedItemById } from '../get.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'

describe('unlinked RSS topic alias category cleanup', () => {
  it('defers a feed mapping after a replacement merge passed its category reference page', async () => {
    const suffix = Math.random().toString(36).slice(2, 15)
    const admin = await createTestUser({ administrator: true })
    const previousTopic = await createTestTopic({ user: admin, name: `Old ${suffix}` })
    const aliasText = `feed-merge-replacement-${suffix}`
    const [alias] = await createTopicAliases(previousTopic.id, aliasText)
    if (!alias) throw new Error('Expected linked alias')
    const replacement = await createTestTopic({
      user: admin,
      name: aliasText,
      slug: `feed-merge-topic-${suffix}`,
    })
    const destination = await createTestTopic({ user: admin })
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://feed-merge-replacement-${suffix}.example.com/feed.xml`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://feed-merge-replacement-${suffix}.example.com/item`,
        guid: `feed-merge-replacement-${suffix}`,
      },
    ])
    if (!item) throw new Error('Expected RSS item')
    await upsertRssFeedCategories(feed.id, [aliasText])
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item.id, categories: [`#${aliasText}`] },
    ])
    await expect(getTestRssFeedCategories(feed.id)).resolves.toContainEqual({
      category_text: aliasText,
      topic_id: previousTopic.id,
    })
    const categoryIdentityId = await registerTestRssCategoryIdentity(aliasText)
    const itemCategoryIdentityId = await registerTestRssCategoryIdentity(`#${aliasText}`)
    await unlinkTopicAlias(alias.id, { expectedTopicId: previousTopic.id, skipSideEffects: true })
    {
      await using mergeHolder = await beginTransaction()
      await lockTopicMergeLifecycles(mergeHolder, [replacement.id])
      await using cleaner = await beginTransaction()
      await lockTopicAliasPublicationScopes(cleaner, [alias.id])
      await expect(
        clearUnlinkedTopicAliasItemPage(
          alias.id,
          alias.alias,
          {
            rows: [{ rss_feed_item_id: item.id, category_identity_id: itemCategoryIdentityId }],
            hasMore: false,
            match: 'alias_id',
          },
          { query: cleaner },
        ),
      ).rejects.toMatchObject({ status: 409 })
    }

    const source = await getTopicByAny(replacement.id)
    const target = await getTopicByAny(destination.id)
    if (!source || !target) throw new Error('Expected merge topics')
    const operation = await createTopicMergeOperation(admin, source, target)
    const feedCategoryPosition = topicMergePlainPages.findIndex(
      page => page.table === 'rss_feed_categories',
    )
    const itemCategoryPosition = topicMergePlainPages.findIndex(
      page => page.table === 'rss_feed_item_categories',
    )
    expect(feedCategoryPosition).toBeGreaterThanOrEqual(0)
    expect(itemCategoryPosition).toBeGreaterThanOrEqual(0)
    const categoryPosition = Math.max(feedCategoryPosition, itemCategoryPosition)
    let checkpoint = await getTopicMergeNativeCheckpoint(operation.id)
    for (let page = 0; page < 2000; page++) {
      if (checkpoint.stage === 'references' && checkpoint.stage_table_position > categoryPosition)
        break
      const nextGeneration = await processTopicMergeOperationPage(
        operation.id,
        checkpoint.generation,
      )
      if (nextGeneration === null) throw new Error('Merge ended before feed category page')
      checkpoint = await getTopicMergeNativeCheckpoint(operation.id)
    }
    expect(checkpoint).toMatchObject({
      stage: 'references',
      stage_table_position: expect.any(Number),
      completed_at: null,
    })
    expect(checkpoint.stage_table_position).toBeGreaterThan(categoryPosition)

    {
      await using blocked = await beginTransaction()
      await expect(
        clearUnlinkedTopicAliasFeedPage(blocked, alias.id, alias.alias, [
          { rss_feed_id: feed.id, category_identity_id: categoryIdentityId },
        ]),
      ).rejects.toMatchObject({ status: 409 })
    }
    await expect(getTestRssFeedCategories(feed.id)).resolves.toContainEqual({
      category_text: aliasText,
      topic_id: previousTopic.id,
    })
    await expect(
      clearUnlinkedTopicAliasItemPage(alias.id, alias.alias, {
        rows: [{ rss_feed_item_id: item.id, category_identity_id: itemCategoryIdentityId }],
        hasMore: false,
        match: 'alias_id',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await settleTopicMergeOperationForTest(admin, replacement.id, operation.id)
    await using retried = await beginTransaction()
    await expect(
      clearUnlinkedTopicAliasFeedPage(retried, alias.id, alias.alias, [
        { rss_feed_id: feed.id, category_identity_id: categoryIdentityId },
      ]),
    ).resolves.toBe(1)
    await retried.commit()
    await expect(
      clearUnlinkedTopicAliasItemPage(alias.id, alias.alias, {
        rows: [{ rss_feed_item_id: item.id, category_identity_id: itemCategoryIdentityId }],
        hasMore: false,
        match: 'alias_id',
      }),
    ).resolves.toMatchObject({ updated: 1 })
    await expect(getTestRssFeedCategories(feed.id)).resolves.toContainEqual({
      category_text: aliasText,
      topic_id: null,
    })
    await expect(getTestRssFeedItemCategories(item.id)).resolves.toContainEqual(
      expect.objectContaining({ category_text: `#${aliasText}`, topic_id: null }),
    )
  })

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

    await finishTopicAliasUnlinkForTest(alias!.id)

    await expect(getTestRssFeedItemCategorySnapshotReconciliation(item!.id)).resolves.toBeDefined()

    await expect(getTestRssFeedItemCategories(item!.id)).resolves.toContainEqual(
      expect.objectContaining({
        category_text: `#${aliasText}`,
        topic_id: replacementTopic.id,
      }),
    )
    await expect(getRssFeedItemById(item!.id)).resolves.toEqual(
      expect.objectContaining({
        categories: expect.arrayContaining([
          expect.objectContaining({
            hashtag: null,
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
