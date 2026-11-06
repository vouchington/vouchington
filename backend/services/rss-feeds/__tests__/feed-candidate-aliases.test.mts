import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import { addCategoryToRssFeedItem } from '@voucha/test-helpers/entities/rss-feed-item-category-fixtures'
import {
  createTestTopicAliasForCategoryMapping,
  updateTestTopicAliasCategoryMappingOwner,
  deleteTopicAliasCategoryMappingDirtyRowsForTest,
} from '@voucha/test-helpers/entities/topic-alias-category-mappings'
import {
  readCandidateFixture,
  setCandidateAliasClaim,
} from '@voucha/test-helpers/rss-feed-candidates'
import { processReconcileTopicAliasCategoryMappings } from '../reconcile-topic-alias-category-mappings.mts'

describe('RSS topic candidate alias ownership', () => {
  it('reconciles linked, reassigned and unlinked positive alias claims without losing another claim', async () => {
    const [first, second] = await Promise.all([createTestTopic(), createTestTopic()])
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    const item = await createTestRssFeedItemWithUrl(feed)
    const aliasId = await createTestTopicAliasForCategoryMapping({ alias: `candidate-${item.id}` })
    onTestFinished(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([aliasId]))
    await setCandidateAliasClaim(item.id, aliasId, 1)
    expect((await readCandidateFixture(item.id, [feed])).topics).toEqual([])
    await updateTestTopicAliasCategoryMappingOwner(aliasId, first.id)
    for (const phase of [1, 2, 3, 4]) {
      const result = await processReconcileTopicAliasCategoryMappings(undefined, [aliasId])
      expect(result.reconciled).toBe(phase === 4 ? 1 : 0)
    }
    await addCategoryToRssFeedItem(item.id, first.id, `other-${item.id}`)
    expect((await readCandidateFixture(item.id, [feed])).topics).toMatchObject([
      { topic_id: first.id, membership_count: '2' },
    ])
    await updateTestTopicAliasCategoryMappingOwner(aliasId, second.id)
    for (const phase of [1, 2, 3, 4]) {
      const result = await processReconcileTopicAliasCategoryMappings(undefined, [aliasId])
      expect(result.reconciled).toBe(phase === 4 ? 1 : 0)
    }
    expect((await readCandidateFixture(item.id, [feed])).topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic_id: first.id, membership_count: '1' }),
        expect.objectContaining({ topic_id: second.id, membership_count: '1' }),
      ]),
    )
    await updateTestTopicAliasCategoryMappingOwner(aliasId, null)
    for (const phase of [1, 2, 3, 4]) {
      const result = await processReconcileTopicAliasCategoryMappings(undefined, [aliasId])
      expect(result.reconciled).toBe(phase === 4 ? 1 : 0)
    }
    expect((await readCandidateFixture(item.id, [feed])).topics).toMatchObject([
      { topic_id: first.id, membership_count: '1' },
    ])
    await setCandidateAliasClaim(item.id, aliasId, 0)
    expect((await readCandidateFixture(item.id, [feed])).topics).toMatchObject([
      { topic_id: first.id, membership_count: '1' },
    ])
  })
})
