import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestTopic,
  deleteTopicAliasCategoryMappingDirtyRowsForTest,
  finishTopicAliasUnlinkForTest,
  getTopicAliasCategoryMappingDirtyRowForTest,
} from '@voucha/test-helpers'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'
import { processReconcileTopicAliasCategoryMappings } from '../reconcile-topic-alias-category-mappings.mts'

describe('pending topic alias category reconciliation', () => {
  it('keeps a pending unlink generation dormant until unlink finalization rearms it', async () => {
    const topic = await createTestTopic()
    const [alias] = await createTopicAliases(topic.id, `pending-category-${randomUUID()}`)
    if (!alias) throw new Error('Expected alias')
    onTestFinished(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([alias.id]))
    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id, skipSideEffects: true })
    const pending = await getTopicAliasCategoryMappingDirtyRowForTest(alias.id)
    expect(pending).toBeDefined()
    await expect(processReconcileTopicAliasCategoryMappings(1, [alias.id])).resolves.toEqual({
      reconciled: 0,
      updated: 0,
      hasMore: false,
    })
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias.id)).resolves.toMatchObject({
      generation: pending!.generation,
    })
    await finishTopicAliasUnlinkForTest(alias.id)
    await expect(getTopicAliasCategoryMappingDirtyRowForTest(alias.id)).resolves.toBeUndefined()
  })
})
