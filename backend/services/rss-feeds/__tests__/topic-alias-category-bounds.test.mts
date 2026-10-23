import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import '@services/elections-votes'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  beginTransaction,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  deleteTopicAliasCategoryMappingDirtyRowsForTest,
  getTestPostgresBackendProcessId,
  getTestRssFeedCategories,
  getTopicAliasCategoryMappingDirtyRowForTest,
  insertTestRssFeedCategory,
  lockTestRssFeedItemCategory,
  setTestRssFeedItemCategoryTopicId,
  updateTestTopicAliasCategoryMappingOwner,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { createTopicAliases } from '@services/topics/aliases'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { rssFeedItemsWorkConfig } from '@services/rss-feed-items/work-limits'
import { overrideDynamicConfigFieldsForTest } from '../../../test-helpers/dynamic-config.mts'
import { rssFeedsWorkConfig } from '../work-limits.mts'
import { processReconcileTopicAliasCategoryMappings } from '../reconcile-topic-alias-category-mappings.mts'

describe('bounded topic alias category reconciliation', () => {
  it('resumes linked and unlinked feed/item batches without acknowledging an incomplete generation', async () => {
    const restoreItems = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      category_backfill_batch_size: 2,
      category_clear_batch_size: 2,
    })
    const restoreFeeds = overrideDynamicConfigFieldsForTest(rssFeedsWorkConfig, {
      category_backfill_batch_size: 2,
    })
    onTestFinished(() => {
      restoreItems()
      restoreFeeds()
    })
    const topic = await createTestTopic()
    const aliasText = `bounded-alias-${randomUUID()}`
    const fixtures = []
    for (let index = 0; index < 3; index++) {
      const feedTopic = await createTestTopic()
      const feedId = await createTestRssFeedWithTiming(feedTopic.id)
      const item = await createTestRssFeedItemWithUrl(feedId)
      await upsertRssFeedItemCategories([{ rss_feed_item_id: item.id, categories: [aliasText] }])
      await insertTestRssFeedCategory(feedId, aliasText, null)
      fixtures.push({ feedId, itemId: item.id })
    }
    const [alias] = await createTopicAliases(topic.id, aliasText)
    if (!alias) throw new Error('Expected topic alias')
    onTestFinished(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([alias.id]))
    const generation = (await getTopicAliasCategoryMappingDirtyRowForTest(alias.id))!.generation
    await expect(
      processReconcileTopicAliasCategoryMappings(undefined, [alias.id]),
    ).resolves.toEqual({
      reconciled: 0,
      updated: 4,
      hasMore: true,
    })
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias.id)).resolves.toMatchObject({
      generation,
    })
    await expect(
      processReconcileTopicAliasCategoryMappings(undefined, [alias.id]),
    ).resolves.toEqual({
      reconciled: 1,
      updated: 2,
      hasMore: false,
    })
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias.id)).resolves.toBeUndefined()
    for (const fixture of fixtures) {
      await expect(getTestRssFeedCategories(fixture.feedId)).resolves.toContainEqual({
        category_text: aliasText,
        topic_id: topic.id,
      })
      await expect(getTestRssFeedItemCategories(fixture.itemId)).resolves.toContainEqual(
        expect.objectContaining({ topic_id: topic.id }),
      )
    }
    await updateTestTopicAliasCategoryMappingOwner(alias.id, null)
    await expect(
      processReconcileTopicAliasCategoryMappings(undefined, [alias.id]),
    ).resolves.toEqual({
      reconciled: 0,
      updated: 4,
      hasMore: true,
    })
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias.id)).resolves.toBeDefined()
    await expect(
      processReconcileTopicAliasCategoryMappings(undefined, [alias.id]),
    ).resolves.toEqual({
      reconciled: 1,
      updated: 2,
      hasMore: false,
    })
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias.id)).resolves.toBeUndefined()
    for (const fixture of fixtures) {
      await expect(getTestRssFeedCategories(fixture.feedId)).resolves.toContainEqual({
        category_text: aliasText,
        topic_id: null,
      })
      await expect(getTestRssFeedItemCategories(fixture.itemId)).resolves.toContainEqual(
        expect.objectContaining({ topic_id: null }),
      )
    }
  })
  it('skips already re-resolved mappings before selecting a bounded unlinked page', async () => {
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      category_clear_batch_size: 1,
    })
    onTestFinished(restore)
    const source = await createTestTopic()
    const aliasText = `bounded-replacement-${randomUUID()}`
    const [alias] = await createTopicAliases(source.id, aliasText)
    if (!alias) throw new Error('Expected topic alias')
    onTestFinished(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([alias.id]))
    const replacement = await createTestTopic({ slug: aliasText })
    const items = []
    for (let index = 0; index < 3; index++) {
      const feedTopic = await createTestTopic()
      const feedId = await createTestRssFeedWithTiming(feedTopic.id)
      const item = await createTestRssFeedItemWithUrl(feedId)
      await upsertRssFeedItemCategories([{ rss_feed_item_id: item.id, categories: [aliasText] }])
      const topicId = index < 2 ? replacement.id : source.id
      await setTestRssFeedItemCategoryTopicId(item.id, aliasText, topicId)
      await insertTestRssFeedCategory(feedId, aliasText, topicId)
      items.push({ feedId, itemId: item.id })
    }
    await updateTestTopicAliasCategoryMappingOwner(alias.id, null)
    await expect(
      processReconcileTopicAliasCategoryMappings(undefined, [alias.id]),
    ).resolves.toEqual({
      reconciled: 0,
      updated: 2,
      hasMore: true,
    })
    const last = items.at(-1)!
    await expect(getTestRssFeedItemCategories(last.itemId)).resolves.toContainEqual(
      expect.objectContaining({ topic_id: replacement.id }),
    )
    await expect(getTestRssFeedCategories(last.feedId)).resolves.toContainEqual({
      category_text: aliasText,
      topic_id: replacement.id,
    })
    await expect(
      processReconcileTopicAliasCategoryMappings(undefined, [alias.id]),
    ).resolves.toEqual({
      reconciled: 1,
      updated: 0,
      hasMore: false,
    })
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias.id)).resolves.toBeUndefined()
  })
  it('continues a newer generation when alias ownership changes before acknowledgement', async () => {
    const firstOwner = await createTestTopic()
    const nextOwner = await createTestTopic()
    const feedTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const aliasText = `bounded-generation-${randomUUID()}`
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item.id, categories: [aliasText] }])
    const [alias] = await createTopicAliases(firstOwner.id, aliasText)
    if (!alias) throw new Error('Expected topic alias')
    onTestFinished(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([alias.id]))
    const ready = Promise.withResolvers<number>()
    const release = Promise.withResolvers<void>()
    async function holdCategory() {
      await using query = await beginTransaction()
      await lockTestRssFeedItemCategory(item.id, aliasText, query)
      ready.resolve(await getTestPostgresBackendProcessId(query))
      await release.promise
      await query.commit()
    }
    const holder = holdCategory()
    let reconciling: ReturnType<typeof processReconcileTopicAliasCategoryMappings> | undefined
    try {
      const holderProcessId = await ready.promise
      reconciling = processReconcileTopicAliasCategoryMappings(undefined, [alias.id])
      await waitForTestPostgresLockWaiter(holderProcessId, 'backfillCategoriesForTopicAliases')
      await updateTestTopicAliasCategoryMappingOwner(alias.id, nextOwner.id)
      const successor = await getTopicAliasCategoryMappingDirtyRowForTest(alias.id)
      release.resolve()
      await holder
      await expect(reconciling).resolves.toMatchObject({ reconciled: 0, hasMore: true })
      await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias.id)).resolves.toMatchObject({
        generation: successor!.generation,
      })
      await expect(
        processReconcileTopicAliasCategoryMappings(undefined, [alias.id]),
      ).resolves.toMatchObject({ reconciled: 1, hasMore: false })
      await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias.id)).resolves.toBeUndefined()
      await expect(getTestRssFeedItemCategories(item.id)).resolves.toContainEqual(
        expect.objectContaining({ topic_id: nextOwner.id }),
      )
    } finally {
      release.resolve()
      await holder
      await reconciling?.catch(() => undefined)
    }
  })
})
