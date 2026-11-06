import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import {
  relationLimitsConfig,
  relationLimitsMaxValues,
  assertRelationLimit,
} from '@services/entity-relations/relation-limits'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import { pruneObsoleteStoryPostRelatedUrlsForReplacement } from '@services/stories/story-post-related-url-projection-replacements'
import type { ProjectionWork } from '@services/stories/story-post-related-url-projection-types'
import { POST_URL_CAPACITY_SEED as seed } from '../seed-data/post-related-url-capacity.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function captureLoweredPostUrlCap(work: ProjectionWork): Promise<void> {
  const id = 'post-url-replacement-lowered-cap'
  relationLimitsConfig.fields.set('post_related_url', 2)
  registerScenarioContract(id, {
    allowEmptyResult: true, // The live transaction asserts removal and replacement admission.
    seededRows: {
      relation__post__related__url: seed.relationRows,
      story_post_related_url_projection_jobs: seed.posts.length,
      story_post_related_url_projection_receipts: seed.posts.length,
      story_post_related_url_projection_relation_mutations: 250,
    },
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'relation__post__related__url',
        max: 2 * relationLimitsMaxValues.post_related_url,
      },
      { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_jobs', max: 1 },
      {
        kind: 'maxProcessedRows',
        relation: 'story_post_related_url_projection_receipts',
        max: relationLimitsMaxValues.post_related_url,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'story_post_related_url_projection_relation_mutations',
        max: relationLimitsMaxValues.post_related_url,
      },
    ],
  })
  // This last owned case has no manual claim; preserve the same state for both plan replays.
  await write(
    `/* clearOwnedLoweredCapProjectionFences */
    DELETE FROM story_post_related_url_projection_relation_mutations WHERE post_id = $1`,
    [work.post_id],
  )
  await runAndCapture(
    id,
    async () => {
      await using query = await beginTransaction()
      await lockPostPublicationPostScopes(query, [work.post_id])
      await pruneObsoleteStoryPostRelatedUrlsForReplacement(query, work, seed.user)
      const { rows } = await query<{ count: number }>(
        `/* verifyLoweredCapProjection */
      SELECT count(*)::integer AS count FROM relation__post__related__url
      WHERE subject_id = $1 AND deleted_at IS NULL`,
        [work.post_id],
      )
      assert.equal(rows[0]?.count, 1)
      const relation = getEntityRelationMetadataOrThrow({
        subjectType: 'post',
        predicate: 'related',
        objectType: 'url',
      })
      await assertRelationLimit(relation, work.post_id, [seed.activeUrl, seed.newUrl], { query })
    },
    undefined,
    'pruneObsoleteStoryPostRelatedUrlsForReplacement',
  )
}
