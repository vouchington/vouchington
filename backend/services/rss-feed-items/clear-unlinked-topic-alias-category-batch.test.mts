import { randomUUID } from 'node:crypto'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation/votes-get'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { getSystemUserByUsername } from '@services/users/system-users'
import { RSS_FEED_CATEGORIZER_USERNAME } from '@services/users/constants'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { processReconcileTopicAliasCategoryMappings } from '../rss-feeds/reconcile-topic-alias-category-mappings.mts'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'
import {
  applyTopicAliasUnlinkPageForTest,
  beginTransaction,
  clearTestRssFeedItemCategoryTopicAlias,
  createTestTopic,
  getEntityRelation,
  getTestPostgresBackendProcessId,
  insertTestRssFeedDirect,
  selectTopicAliasUnlinkInitialPageForTest,
  updateTopicName,
} from '@voucha/test-helpers'
import {
  countTestRssFeedItemAliasCategoryBindings,
  getTestRssFeedItemCategories,
} from '@voucha/test-helpers/entities/rss-feed-item-categories'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getTopicAliasCategoryMappingDirtyRowForTest } from '@voucha/test-helpers/entities/topic-alias-category-mappings'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { describe, expect, it, onTestFinished } from 'vitest'
import { upsertRssFeedItemCategories } from './categories.mts'
import { upsertRssFeedItems } from './upsert.mts'
import { rssFeedItemsWorkConfig } from './work-limits.mts'
import { lockRssFeedItemsForStoryPublicationChanges } from './story-publication-change.mts'
import { deleteStaleCategoriesAndRetractVotes } from './reconcile-categories-delete.mts'

describe('topic alias unlink category page', () => {
  it('waits for snapshot item locks before category locks and rechecks a deleted text mapping', async () => {
    const suffix = randomUUID()
    const aliasText = `snapshot-category-alias-${suffix}`
    const topic = await createTestTopic({
      name: aliasText,
      slug: `snapshot-category-owner-${suffix}`,
    })
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://snapshot-category-${suffix}.example.com/feed.xml`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://snapshot-category-${suffix}.example.com/item`,
        guid: `snapshot-category-${suffix}`,
        title: `Snapshot category ${suffix}`,
      },
    ])
    if (!item) throw new Error('Expected RSS item')
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item.id, categories: [aliasText] }])
    const [alias] = await createTopicAliases(topic.id, aliasText, { skipSideEffects: true })
    if (!alias) throw new Error('Expected linked alias')
    await clearTestRssFeedItemCategoryTopicAlias(item.id, aliasText)
    expect(await countTestRssFeedItemAliasCategoryBindings(alias.id, [item.id])).toBe(0)
    await expect(getTestRssFeedItemCategories(item.id)).resolves.toContainEqual(
      expect.objectContaining({ category_text: aliasText, topic_id: topic.id }),
    )
    const relationMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic',
      predicate: 'category',
    })
    const [relation] = await getEntityRelation(relationMetadata.table_name, item.id, topic.id)
    const relationId = (relation as { id?: string } | undefined)?.id
    if (!relationId) throw new Error('Expected category relation')
    const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
    if (!categorizer) throw new Error('Expected RSS categorizer')
    await expect(getEntityRelationElectionVote(categorizer.id, relationId)).resolves.toMatchObject({
      choice: 'confirm',
    })

    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id, skipSideEffects: true })
    let page = await selectTopicAliasUnlinkInitialPageForTest(alias.id, alias.alias)
    for (let count = 0; count < 20; count += 1) {
      const next = await applyTopicAliasUnlinkPageForTest(page)
      if (!next) break
      page = next
      if (count === 19) throw new Error('Alias unlink exceeded twenty pages')
    }
    // Keep the former topic from matching the ordinary text category as its replacement.
    await updateTopicName(topic.id, `Renamed snapshot category ${suffix}`)
    await expect(processReconcileTopicAliasCategoryMappings(1, [alias.id])).resolves.toMatchObject({
      updated: 0,
      hasMore: true,
    })

    await using holder = await beginTransaction()
    await lockRssFeedItemsForStoryPublicationChanges(holder, [item.id])
    const holderProcessId = await getTestPostgresBackendProcessId(holder)
    await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'advisory', key: `rss_feed:${feed.id}` },
        queryMarker: 'lockPostPublicationRssFeedScopes',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const cleaning = processReconcileTopicAliasCategoryMappings(1, [alias.id])
        void cleaning.catch(() => {})
        await waitForLock(cleaning)
        const deleted = await deleteStaleCategoriesAndRetractVotes(
          [{ rss_feed_item_id: item.id, categories: [] }],
          holder,
        )
        expect(deleted.staleCategories).toHaveLength(1)
        await holder.commit()
        await expect(cleaning).rejects.toMatchObject({
          errors: [expect.objectContaining({ status: 409 })],
        })
      },
    )
    await expect(getTestRssFeedItemCategories(item.id)).resolves.toEqual([])
    await expect(getEntityRelationElectionVote(categorizer.id, relationId)).resolves.toBeNull()
    await expect(processReconcileTopicAliasCategoryMappings(1, [alias.id])).resolves.toMatchObject({
      updated: 0,
      hasMore: true,
    })
    await processReconcileTopicAliasCategoryMappings(1, [alias.id])
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias.id)).resolves.toBeUndefined()
  })

  it('clears every mapping and categorizer vote before removing a larger binding page', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
        topic_alias_unlink_page_size: 3,
      }),
    )
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, { category_clear_batch_size: 1 }),
    )
    const suffix = randomUUID()
    const topic = await createTestTopic({
      name: `Unlink category page ${suffix}`,
      slug: `unlink-category-page-${suffix}`,
    })
    const [alias] = await createTopicAliases(topic.id, `unlink-category-alias-${suffix}`)
    if (!alias) throw new Error('Expected topic alias')
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://unlink-category-${suffix}.example.com/feed.xml`,
      topicId: topic.id,
    })
    const items = await upsertRssFeedItems(
      feed.id,
      Array.from({ length: 3 }, (_, index) => ({
        link: `https://unlink-category-${suffix}.example.com/item-${index}`,
        guid: `unlink-category-${suffix}-${index}`,
        title: `Unlink category ${index}`,
      })),
    )
    expect(items).toHaveLength(3)
    const itemIds = items.map(item => item.id)
    const categoryText = `#${alias.alias}`
    await upsertRssFeedItemCategories(
      itemIds.map(itemId => ({ rss_feed_item_id: itemId, categories: [categoryText] })),
    )
    expect(await countTestRssFeedItemAliasCategoryBindings(alias.id, itemIds)).toBe(3)
    const relationMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic',
      predicate: 'category',
    })
    const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
    if (!categorizer) throw new Error('Expected RSS categorizer')
    const relationIds = await Promise.all(
      itemIds.map(async itemId => {
        const [relation] = await getEntityRelation(relationMetadata.table_name, itemId, topic.id)
        const id = (relation as { id?: string } | undefined)?.id
        if (!id) throw new Error(`Expected category relation for ${itemId}`)
        return id
      }),
    )
    for (const relationId of relationIds) {
      await expect(
        getEntityRelationElectionVote(categorizer.id, relationId),
      ).resolves.toMatchObject({
        choice: 'confirm',
      })
    }

    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id, skipSideEffects: true })
    const page = await selectTopicAliasUnlinkInitialPageForTest(alias.id, alias.alias)
    expect(page.phase).toBe('rss_item_categories')
    await applyTopicAliasUnlinkPageForTest(page)

    expect(await countTestRssFeedItemAliasCategoryBindings(alias.id, itemIds)).toBe(0)
    for (const itemId of itemIds) {
      await expect(getTestRssFeedItemCategories(itemId)).resolves.toContainEqual(
        expect.objectContaining({ category_text: categoryText, topic_id: null }),
      )
    }
    for (const relationId of relationIds) {
      await expect(getEntityRelationElectionVote(categorizer.id, relationId)).resolves.toBeNull()
    }
  })
})
