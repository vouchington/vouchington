import {
  getRssFeedItemCategories,
  upsertRssFeedItemCategories,
} from '@services/rss-feed-items/categories'
import { createTopicAliases } from '@services/topics/aliases'
import {
  acknowledgeTopicAliasCategoryMappingDirtyRowForTest,
  countTopicAliasCategoryMappingDirtyRowsForTest,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestTopicAliasForCategoryMapping,
  createTopicAliasCategoryMappingDirtyRowsForTest,
  deleteTestTopicAliasForCategoryMapping,
  deleteTopicAliasCategoryMappingDirtyRowsForTest,
  getTestRssFeedCategories,
  getTopicAliasCategoryMappingDirtyRowForTest,
  insertTestRssFeedCategory,
  prioritizeTopicAliasCategoryMappingDirtyRowForTest,
  updateTestTopicAliasCategoryMappingOwner,
} from '@voucha/test-helpers'
import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it } from 'vitest'
import { processReconcileTopicAliasCategoryMappings } from '../reconcile-topic-alias-category-mappings.mts'

describe('topic alias category mapping reconciliation', () => {
  it('records linked creates and every owner transition, but not standalone creates or deletes', async () => {
    const topicA = await createTestTopic()
    const topicB = await createTestTopic()
    const standaloneAlias = `dirty-standalone-${topicA.id}`
    const linkedAlias = `dirty-linked-${topicA.id}`
    const standaloneId = await createTestTopicAliasForCategoryMapping({ alias: standaloneAlias })
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(standaloneId)).resolves.toBeUndefined()

    await updateTestTopicAliasCategoryMappingOwner(standaloneId, topicA.id)
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(standaloneId)).resolves.toMatchObject({
      generation: '1',
    })
    await updateTestTopicAliasCategoryMappingOwner(standaloneId, topicB.id)
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(standaloneId)).resolves.toMatchObject({
      generation: '2',
    })
    await updateTestTopicAliasCategoryMappingOwner(standaloneId, null)
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(standaloneId)).resolves.toMatchObject({
      generation: '3',
    })
    await deleteTopicAliasCategoryMappingDirtyRowsForTest([standaloneId])
    await deleteTestTopicAliasForCategoryMapping(standaloneId)
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(standaloneId)).resolves.toBeUndefined()

    const linkedId = await createTestTopicAliasForCategoryMapping({
      topicId: topicA.id,
      alias: linkedAlias,
    })
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(linkedId)).resolves.toMatchObject({
      alias: linkedAlias,
      generation: '1',
    })
    await deleteTestTopicAliasForCategoryMapping(linkedId)
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(linkedId)).resolves.toMatchObject({
      alias: linkedAlias,
      generation: '2',
    })
    await deleteTopicAliasCategoryMappingDirtyRowsForTest([linkedId])
  })

  it('clears every stale mapping after A to B to standalone before the durable drain', async () => {
    const topicA = await createTestTopic()
    const topicB = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topicA.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const [alias] = await createTopicAliases(topicA.id, `reconcile-unlinked-${item.id}`)
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item.id, categories: [`#${alias!.alias}`] },
    ])
    await insertTestRssFeedCategory(feedId, alias!.alias, topicA.id)
    await updateTestTopicAliasCategoryMappingOwner(alias!.id, topicB.id)
    await updateTestTopicAliasCategoryMappingOwner(alias!.id, null)
    await prioritizeTopicAliasCategoryMappingDirtyRowForTest(alias!.id)

    await processReconcileTopicAliasCategoryMappings()
    await expect(getRssFeedItemCategories(item.id)).resolves.toContainEqual(
      expect.objectContaining({ category_text: `#${alias!.alias}`, topic_id: null }),
    )
    await expect(getTestRssFeedCategories(feedId)).resolves.toContainEqual({
      category_text: alias!.alias,
      topic_id: null,
    })
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias!.id)).resolves.toBeUndefined()
    await processReconcileTopicAliasCategoryMappings()
  })

  it('keeps a newer generation when an older worker acknowledgement races a relink', async () => {
    const topicA = await createTestTopic()
    const topicB = await createTestTopic()
    const [alias] = await createTopicAliases(topicA.id, `reconcile-cas-${topicA.id}`)
    const first = (await getTopicAliasCategoryMappingDirtyRowForTest(alias!.id))!
    await updateTestTopicAliasCategoryMappingOwner(alias!.id, topicB.id)
    await acknowledgeTopicAliasCategoryMappingDirtyRowForTest(alias!.id, first.generation)

    await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias!.id)).resolves.toMatchObject({
      generation: '2',
    })
    await deleteTopicAliasCategoryMappingDirtyRowsForTest([alias!.id])
  })

  it('drains only 25 dirty rows per run', async () => {
    const ids = Array.from({ length: 26 }, () => uuidv7({ msecs: 0 }))
    const aliases = ids.map(id => `reconcile-boundary-${id}`)
    await createTopicAliasCategoryMappingDirtyRowsForTest(
      ids.map((topicAliasId, index) => ({ alias: aliases[index]!, topicAliasId })),
    )

    await expect(processReconcileTopicAliasCategoryMappings()).resolves.toEqual({
      reconciled: 25,
      updated: 0,
    })
    await expect(countTopicAliasCategoryMappingDirtyRowsForTest(ids)).resolves.toBe(1)
    await deleteTopicAliasCategoryMappingDirtyRowsForTest(ids)
  })
})
