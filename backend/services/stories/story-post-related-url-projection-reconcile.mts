import { beginTransaction, write } from '@data-stores/psql'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import { recordPostRelatedUrlPublicationChanges } from '@services/entity-relations/post-topic-publication'
import { getSystemUserByUsername } from '@services/users/system-users'
import {
  drainStoryPostRelatedUrlProjectionInvalidation,
  markStoryPostRelatedUrlProjectionInvalidationRequired,
} from './story-post-related-url-projection-invalidation.mts'
import { writeStoryPostRelatedUrlProjectionRelations } from './story-post-related-url-projection-relations.mts'
import { drainPendingStoryPostRelatedUrlProjectionCrawlEffects } from './story-post-related-url-projection-relation-safety.mts'
import { runWithStoryPostRelatedUrlProjectionLeaseRenewal } from './story-post-related-url-projection-lease.mts'
import {
  decideStoryPostRelatedUrlProjectionRows,
  getStoryPostRelatedUrlProjectionSourcePageForWork,
  stageStoryPostRelatedUrlProjectionReceipts,
  STORY_POST_RELATED_URL_PROJECTION_PAGE_SIZE,
} from './story-post-related-url-projection-source.mts'
import type {
  ProjectionResult,
  ProjectionWork,
  SourceDecision,
} from './story-post-related-url-projection-types.mts'
import {
  cleanupStaleStoryPostRelatedUrlProjectionRelationMutations,
  cleanupStaleStoryPostRelatedUrlProjectionReceipts,
  hasStaleStoryPostRelatedUrlProjectionState,
} from './story-post-related-url-projection-cleanup.mts'
import {
  advanceStoryPostRelatedUrlProjectionSourceCursor,
  advanceStoryPostRelatedUrlProjectionSourcePhase,
  claimStoryPostRelatedUrlProjectionWork,
  completeStoryPostRelatedUrlProjectionWork,
  hasClaimableStoryPostRelatedUrlProjectionWork,
  isStoryPostRelatedUrlProjectionWorkCurrent,
  markStoryPostRelatedUrlProjection,
  releaseStoryPostRelatedUrlProjectionWork,
} from './story-post-related-url-projection-work.mts'

export { markStoryPostRelatedUrlProjection }

export async function reconcileStoryPostRelatedUrlProjection(
  options: { continueDispatcherAfterCompletion?: boolean; postId?: string } = {},
): Promise<ProjectionResult> {
  const work = await claimStoryPostRelatedUrlProjectionWork(options.postId)
  if (!work) return { processed: 0, continue: false }
  try {
    if (!(await drainStoryPostRelatedUrlProjectionInvalidation(work)))
      return { processed: 0, continue: false }
    const recoveredCrawlEffects = await drainPendingStoryPostRelatedUrlProjectionCrawlEffects(work)
    if (recoveredCrawlEffects === null) return { processed: 0, continue: false }
    if (recoveredCrawlEffects > 0) return { processed: recoveredCrawlEffects, continue: true }
    if (!work.source_completed_at) return await projectSourcePage(work)
    return await prunePage(
      work,
      options.continueDispatcherAfterCompletion ?? options.postId === undefined,
    )
  } finally {
    await releaseStoryPostRelatedUrlProjectionWork(work)
  }
}

async function projectSourcePage(work: ProjectionWork): Promise<ProjectionResult> {
  const result = await runWithStoryPostRelatedUrlProjectionLeaseRenewal(
    work,
    projectSourcePageWithCurrentLease,
  )
  return result?.value ?? { processed: 0, continue: false }
}

async function projectSourcePageWithCurrentLease(work: ProjectionWork): Promise<ProjectionResult> {
  const rows = await getStoryPostRelatedUrlProjectionSourcePageForWork(work)
  if (rows.length === 0) {
    await advanceStoryPostRelatedUrlProjectionSourcePhase(work)
    return { processed: 0, continue: true }
  }
  const decisions = await decideStoryPostRelatedUrlProjectionRows(work, rows)
  if (!(await stageStoryPostRelatedUrlProjectionReceipts(work, decisions)))
    return { processed: 0, continue: false }
  const eligible: SourceDecision[] = []
  for (const row of decisions) {
    if (row.eligible) eligible.push(row)
  }
  if (eligible.length > 0 && !(await writeStoryPostRelatedUrlProjectionRelations(work, eligible))) {
    return { processed: 0, continue: false }
  }
  if (!(await drainStoryPostRelatedUrlProjectionInvalidation(work)))
    return { processed: 0, continue: false }
  const advanced = await advanceStoryPostRelatedUrlProjectionSourceCursor(work, rows.at(-1)!.id)
  return { processed: advanced ? rows.length : 0, continue: advanced }
}

async function prunePage(
  work: ProjectionWork,
  continueDispatcher: boolean,
): Promise<ProjectionResult> {
  const { rows } = await write<{ relation_id: string; object_id: string }>(
    `/* pruneStoryPostRelatedUrlProjection */
      SELECT relation.id AS relation_id, relation.object_id
      FROM relation__post__related__url relation
      WHERE relation.subject_id = $1 AND relation.deleted_at IS NULL
        AND $2::uuid IS NOT NULL AND relation.id <= $2::uuid
        AND relation.created_at <= $3::timestamptz
        AND ($4::uuid IS NULL OR relation.id > $4::uuid)
      ORDER BY relation.id LIMIT $5`,
    [
      work.post_id,
      work.relation_high_water_id,
      work.relation_snapshot_at,
      work.prune_cursor_id,
      STORY_POST_RELATED_URL_PROJECTION_PAGE_SIZE,
    ],
  )
  if (rows.length === 0) {
    const cleaned = await cleanupStaleStoryPostRelatedUrlProjectionReceipts(
      work,
      STORY_POST_RELATED_URL_PROJECTION_PAGE_SIZE,
    )
    if (cleaned > 0) return { processed: cleaned, continue: true }
    const cleanedMutations = await cleanupStaleStoryPostRelatedUrlProjectionRelationMutations(
      work,
      STORY_POST_RELATED_URL_PROJECTION_PAGE_SIZE,
    )
    if (cleanedMutations > 0) return { processed: cleanedMutations, continue: true }
    if (!(await isStoryPostRelatedUrlProjectionWorkCurrent(work)))
      return { processed: 0, continue: false }
    if (await hasStaleStoryPostRelatedUrlProjectionState(work))
      return { processed: 0, continue: true }
    const completed = await completeStoryPostRelatedUrlProjectionWork(work)
    return {
      processed: 0,
      continue:
        completed && continueDispatcher && (await hasClaimableStoryPostRelatedUrlProjectionWork()),
    }
  }
  const relationIds: string[] = []
  const objectIds: string[] = []
  for (const row of rows) {
    relationIds.push(row.relation_id)
    objectIds.push(row.object_id)
  }
  const storyTeller = await getSystemUserByUsername('story-teller')
  if (!storyTeller)
    throw new Error('story post URL projection: @story-teller system user not found')
  await using query = await beginTransaction()
  await lockPostPublicationPostScopes(query, [work.post_id])
  if (!(await isStoryPostRelatedUrlProjectionWorkCurrent(work, query, true)))
    return { processed: 0, continue: false }
  const { rows: removed } = await query<{ object_id: string }>(
    `/* pruneStoryPostRelatedUrlProjectionRows */
        UPDATE relation__post__related__url relation
        SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = $5
        WHERE relation.subject_id = $1 AND relation.id = ANY($2::uuid[])
          AND relation.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM story_post_related_url_projection_jobs work
            WHERE work.post_id = $1 AND work.generation = $3 AND work.lease_token = $4
              AND work.lease_expires_at > clock_timestamp()
          )
          AND NOT EXISTS (
            SELECT 1 FROM story_post_related_url_projection_receipts receipt
            WHERE receipt.post_id = $1 AND receipt.generation = $3
              AND receipt.url_id = relation.object_id AND receipt.eligible = TRUE
          )
          AND NOT EXISTS (
            SELECT 1 FROM story_post_related_url_projection_relation_mutations mutation
            WHERE mutation.post_id = $1 AND mutation.generation = $3
              AND mutation.relation_id = relation.id
          )
        RETURNING relation.subject_id, relation.object_id`,
    [work.post_id, relationIds, work.generation, work.lease_token, storyTeller.id],
  )
  if (removed.length > 0) await recordPostRelatedUrlPublicationChanges(query, [work.post_id])
  if (removed.length > 0) await markStoryPostRelatedUrlProjectionInvalidationRequired(query, work)
  await query.commit()
  if (!(await drainStoryPostRelatedUrlProjectionInvalidation(work)))
    return { processed: 0, continue: false }
  await write(
    `/* advanceStoryPostRelatedUrlProjectionPruneCursor */
      UPDATE story_post_related_url_projection_jobs SET prune_cursor_id = $1
      WHERE post_id = $2 AND generation = $3 AND lease_token = $4
        AND lease_expires_at > clock_timestamp()`,
    [relationIds.at(-1), work.post_id, work.generation, work.lease_token],
  )
  return { processed: objectIds.length, continue: true }
}
