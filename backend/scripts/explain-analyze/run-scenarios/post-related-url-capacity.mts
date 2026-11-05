import { POST_URL_CAPACITY_SCENARIOS } from '../post-related-url-capacity-scenario-ids.mts'
import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import {
  getRelationLimitState,
  assertRelationLimits,
  relationLimitsConfig,
} from '@services/entity-relations/relation-limits'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  cleanupPostUrlCapacity,
  POST_URL_CAPACITY_SEED as seed,
  seedPostUrlCapacity,
} from '../seed-data/post-related-url-capacity.mts'

export async function runPostUrlCapacityScenarios(): Promise<void> {
  await relationLimitsConfig.waitForInitialization()
  const previous = relationLimitsConfig.fields.get('post_related_url')
  try {
    await cleanupPostUrlCapacity()
    await seedPostUrlCapacity()
    // Settle fixture visibility before costing the existing index-only access paths.
    await write('/* preparePostUrlCapacity */ VACUUM (ANALYZE) relation__post__related__url')
    const cases = [
      [1000, 0],
      [10000, 1],
      [1000, 2],
      [10000, 2],
    ] as const
    for (const [index, [limit, subjectIndex]] of cases.entries()) {
      relationLimitsConfig.fields.set('post_related_url', limit)
      // no-mistakes-disable-next-line query-reached-per-item: four fixed populations own separate captured plans and row budgets.
      await captureCapacity(POST_URL_CAPACITY_SCENARIOS[index]!, limit, seed.posts[subjectIndex]!)
    }
    relationLimitsConfig.fields.set('post_related_url', 1000)
    await captureCapacity(POST_URL_CAPACITY_SCENARIOS[4], 1000, seed.posts[0]!, seed.posts[2]!)
  } finally {
    if (previous === undefined) relationLimitsConfig.fields.delete('post_related_url')
    else relationLimitsConfig.fields.set('post_related_url', previous)
    await cleanupPostUrlCapacity()
    await write('/* analyzePostUrlCapacityCleanup */ ANALYZE relation__post__related__url')
  }
}

async function captureCapacity(
  id: string,
  limit: number,
  postId: string,
  otherPostId?: string,
): Promise<void> {
  const postIds = otherPostId ? [postId, otherPostId] : [postId]
  const budget = (limit + 3) * postIds.length
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    predicate: 'related',
    objectType: 'url',
  })
  registerScenarioContract(id, {
    seededRows: { [relation.table_name]: seed.relationRows },
    expectations: [
      { kind: 'maxProcessedRows', relation: relation.table_name, max: budget },
      { kind: 'maxBitmapIndexRows', max: budget },
    ],
  })
  await using query = await beginTransaction()
  await lockPostPublicationPostScopes(query, postIds)
  await runAndCapture(
    id,
    async () => {
      if (otherPostId) {
        await assert.rejects(
          () =>
            assertRelationLimits(
              postIds.map(subjectId => ({
                relation,
                subjectId,
                objectIds: [seed.activeUrl, seed.deletedUrl, seed.newUrl],
              })),
              { query },
            ),
          { code: 'RELATION_LIMIT_REACHED' },
        )
        return
      }
      const state = await getRelationLimitState(
        relation,
        postId,
        [seed.activeUrl, seed.deletedUrl, seed.newUrl],
        { query },
      )
      assert.equal(state?.remaining, 0)
      assert.deepEqual(state.existingObjectIds, [seed.activeUrl])
    },
    undefined,
    'getRelationLimitState',
  )
  await query.commit()
}
