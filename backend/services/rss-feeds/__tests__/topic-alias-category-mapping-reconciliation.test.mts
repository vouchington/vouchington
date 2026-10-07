import '@services/elections-votes'
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
  updateTestTopicAliasCategoryMappingOwner,
} from '@voucha/test-helpers'
import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '../../../test-helpers/dynamic-config.mts'
import { rssFeedsWorkConfig } from '../work-limits.mts'
import { processReconcileTopicAliasCategoryMappings } from '../reconcile-topic-alias-category-mappings.mts'

describe('topic alias category mapping reconciliation', () => {
  it('records linked creates and every owner transition, but not standalone creates or deletes', async () => {
    const owned = ownDirtyRows()
    const topicA = await owned.run(() => createTestTopic())
    const topicB = await owned.run(() => createTestTopic())
    const standaloneAlias = `dirty-standalone-${topicA.id}`
    const linkedAlias = `dirty-linked-${topicA.id}`
    const standaloneId = await owned.run(
      () => createTestTopicAliasForCategoryMapping({ alias: standaloneAlias }),
      id => owned.ids.push(id),
    )
    await expect(
      owned.run(() => getTopicAliasCategoryMappingDirtyRowForTest(standaloneId)),
    ).resolves.toBeUndefined()

    await owned.run(() => updateTestTopicAliasCategoryMappingOwner(standaloneId, topicA.id))
    await expect(
      owned.run(() => getTopicAliasCategoryMappingDirtyRowForTest(standaloneId)),
    ).resolves.toMatchObject({
      generation: '1',
    })
    await owned.run(() => updateTestTopicAliasCategoryMappingOwner(standaloneId, topicB.id))
    await expect(
      owned.run(() => getTopicAliasCategoryMappingDirtyRowForTest(standaloneId)),
    ).resolves.toMatchObject({
      generation: '2',
    })
    await owned.run(() => updateTestTopicAliasCategoryMappingOwner(standaloneId, null))
    await expect(
      owned.run(() => getTopicAliasCategoryMappingDirtyRowForTest(standaloneId)),
    ).resolves.toMatchObject({
      generation: '3',
    })
    await owned.run(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([standaloneId]))
    await owned.run(() => deleteTestTopicAliasForCategoryMapping(standaloneId))
    await expect(
      owned.run(() => getTopicAliasCategoryMappingDirtyRowForTest(standaloneId)),
    ).resolves.toBeUndefined()

    const linkedId = await owned.run(
      () =>
        createTestTopicAliasForCategoryMapping({
          topicId: topicA.id,
          alias: linkedAlias,
        }),
      id => owned.ids.push(id),
    )
    await expect(
      owned.run(() => getTopicAliasCategoryMappingDirtyRowForTest(linkedId)),
    ).resolves.toMatchObject({
      alias: linkedAlias,
      generation: '1',
    })
    await owned.run(() => deleteTestTopicAliasForCategoryMapping(linkedId))
    await expect(
      owned.run(() => getTopicAliasCategoryMappingDirtyRowForTest(linkedId)),
    ).resolves.toMatchObject({
      alias: linkedAlias,
      generation: '2',
    })
    await owned.run(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([linkedId]))
  })

  it('clears every stale mapping after A to B to standalone before the durable drain', async () => {
    const owned = ownDirtyRows()
    const topicA = await owned.run(() => createTestTopic())
    const topicB = await owned.run(() => createTestTopic())
    const feedId = await owned.run(() => createTestRssFeedWithTiming(topicA.id))
    const item = await owned.run(() => createTestRssFeedItemWithUrl(feedId))
    const [alias] = await owned.run(
      () => createTopicAliases(topicA.id, `reconcile-unlinked-${item.id}`),
      aliases => owned.ids.push(...aliases.map(alias => alias.id)),
    )
    const foreignId = uuidv7()
    owned.ids.push(foreignId)
    await owned.run(() =>
      createTopicAliasCategoryMappingDirtyRowsForTest([
        { alias: `reconcile-foreign-${foreignId}`, topicAliasId: foreignId },
      ]),
    )
    await owned.run(() =>
      upsertRssFeedItemCategories([
        { rss_feed_item_id: item.id, categories: [`#${alias!.alias}`] },
      ]),
    )
    await owned.run(() => insertTestRssFeedCategory(feedId, alias!.alias, topicA.id))
    await owned.run(() => updateTestTopicAliasCategoryMappingOwner(alias!.id, topicB.id))
    await owned.run(() => updateTestTopicAliasCategoryMappingOwner(alias!.id, null))

    await owned.run(() => processReconcileTopicAliasCategoryMappings(undefined, [alias!.id]))
    await expect(owned.run(() => getRssFeedItemCategories(item.id))).resolves.toContainEqual(
      expect.objectContaining({ category_text: `#${alias!.alias}`, topic_id: null }),
    )
    await expect(owned.run(() => getTestRssFeedCategories(feedId))).resolves.toContainEqual({
      category_text: alias!.alias,
      topic_id: null,
    })
    await expect(
      owned.run(() => getTopicAliasCategoryMappingDirtyRowForTest(alias!.id)),
    ).resolves.toBeUndefined()
    await expect(
      owned.run(() => countTopicAliasCategoryMappingDirtyRowsForTest([foreignId])),
    ).resolves.toBe(1)
    await expect(
      owned.run(() => processReconcileTopicAliasCategoryMappings(undefined, [alias!.id])),
    ).resolves.toEqual({ reconciled: 0, updated: 0 })
    await owned.run(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([foreignId]))
  })

  it('keeps a newer generation when an older worker acknowledgement races a relink', async () => {
    const owned = ownDirtyRows()
    const topicA = await owned.run(() => createTestTopic())
    const topicB = await owned.run(() => createTestTopic())
    const [alias] = await owned.run(
      () => createTopicAliases(topicA.id, `reconcile-cas-${topicA.id}`),
      aliases => owned.ids.push(...aliases.map(alias => alias.id)),
    )
    const first = (await owned.run(() => getTopicAliasCategoryMappingDirtyRowForTest(alias!.id)))!
    await owned.run(() => updateTestTopicAliasCategoryMappingOwner(alias!.id, topicB.id))
    await owned.run(() =>
      acknowledgeTopicAliasCategoryMappingDirtyRowForTest(alias!.id, first.generation),
    )

    await expect(
      owned.run(() => getTopicAliasCategoryMappingDirtyRowForTest(alias!.id)),
    ).resolves.toMatchObject({
      generation: '2',
    })
    await owned.run(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([alias!.id]))
  })

  it('drains only the configured batch and leaves foreign rows untouched', async () => {
    const owned = ownDirtyRows()
    owned.restoreConfig = overrideDynamicConfigFieldsForTest(rssFeedsWorkConfig, {
      topic_alias_category_mapping_reconciliation_batch_size: 2,
    })
    const ids = Array.from({ length: 3 }, () => uuidv7())
    owned.ids.push(...ids)
    const foreignId = uuidv7()
    owned.ids.push(foreignId)
    const aliases = ids.map(id => `reconcile-boundary-${id}`)
    await owned.run(() =>
      createTopicAliasCategoryMappingDirtyRowsForTest([
        ...ids.map((topicAliasId, index) => ({ alias: aliases[index]!, topicAliasId })),
        { alias: `reconcile-boundary-foreign-${foreignId}`, topicAliasId: foreignId },
      ]),
    )

    await expect(
      owned.run(() => processReconcileTopicAliasCategoryMappings(undefined, ids)),
    ).resolves.toEqual({
      reconciled: 2,
      updated: 0,
    })
    await expect(
      owned.run(() => countTopicAliasCategoryMappingDirtyRowsForTest(ids)),
    ).resolves.toBe(1)
    await expect(
      owned.run(() => countTopicAliasCategoryMappingDirtyRowsForTest([foreignId])),
    ).resolves.toBe(1)
    await expect(
      owned.run(() => processReconcileTopicAliasCategoryMappings(undefined, ids)),
    ).resolves.toEqual({
      reconciled: 1,
      updated: 0,
    })
    await expect(
      owned.run(() => processReconcileTopicAliasCategoryMappings(undefined, ids)),
    ).resolves.toEqual({
      reconciled: 0,
      updated: 0,
    })
    await expect(
      owned.run(() => countTopicAliasCategoryMappingDirtyRowsForTest([foreignId])),
    ).resolves.toBe(1)
  })
})

/** Stop new mutations, then drain admitted work before deleting only this case's markers. */
function ownDirtyRows() {
  const started: Promise<unknown>[] = []
  let finishing = false
  const owned = {
    ids: [] as string[],
    restoreConfig: () => {},
    run<T>(operation: () => Promise<T>, capture?: (value: T) => void): Promise<T> {
      if (finishing) throw new Error('Owned reconciliation fixture is finishing')
      const pending = operation().then(value => {
        capture?.(value)
        return value
      })
      started.push(pending)
      void pending.catch(() => {})
      return pending
    },
  }
  onTestFinished(async () => {
    finishing = true
    await Promise.allSettled(started)
    try {
      await deleteTopicAliasCategoryMappingDirtyRowsForTest(owned.ids)
    } finally {
      owned.restoreConfig()
    }
  })
  return owned
}
