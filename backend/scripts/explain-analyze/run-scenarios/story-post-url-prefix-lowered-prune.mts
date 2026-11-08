import assert from 'node:assert/strict'
import {
  getRelationTypeLimit,
  relationLimitsMaxValues,
} from '@services/entity-relations/relation-limits-config'
import { pruneStoryPostRelatedUrlsOutsidePrefix } from '@services/stories/story-post-related-url-projection-prune'
import { registerScenarioContract } from '../plan-expectations.mts'
import { POST_URL_CAPACITY_SEED as seed } from '../seed-data/post-related-url-capacity.mts'
import { captureRollback } from './story-post-url-prefix-capture.mts'
import { activeUrlIds, MAXIMUM_LEASE, projectionWork } from './story-post-url-prefix-setup.mts'

const HARD_MAX = relationLimitsMaxValues.post_related_url

/** Live rows stay at the hard max. The admitted prefix is the lowered runtime cap. */
export async function captureLoweredCapPrune(relationIndexes: readonly string[]): Promise<void> {
  const id = 'story-post-related-url-prune-lowered-cap'
  const loweredCap = getRelationTypeLimit('relation__post__related__url')
  assert.ok(loweredCap !== null && loweredCap < HARD_MAX)
  const liveUrlIds = await activeUrlIds(seed.posts[1]!)
  assert.equal(liveUrlIds.length, HARD_MAX)
  const admittedUrlIds = liveUrlIds.slice(0, loweredCap)
  // The heap read is the live hard max. The update node counts each row outside the lowered prefix.
  const removed = liveUrlIds.length - admittedUrlIds.length
  registerScenarioContract(id, {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: relationIndexes,
        anyOf: true,
        queryContains: 'pruneStoryPostRelatedUrlsOutsidePrefix',
      },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__post__related__url',
        max: liveUrlIds.length + removed + 1,
      },
    ],
    forbidSequentialScans: ['relation__post__related__url'],
    seededRows: { relation__post__related__url: seed.relationRows },
  })
  await captureRollback(id, 'pruneStoryPostRelatedUrlsOutsidePrefix', query =>
    pruneStoryPostRelatedUrlsOutsidePrefix(
      query,
      projectionWork(seed.posts[1]!, MAXIMUM_LEASE),
      seed.user,
      admittedUrlIds,
    ),
  )
}
