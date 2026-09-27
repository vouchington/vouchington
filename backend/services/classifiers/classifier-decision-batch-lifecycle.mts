import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ClassifierDecisionSnapshot } from './write-decision-lineage.mts'

export type LockedClassifierDecisionBatch = {
  classifierId: string
  promptVersionId: string
  postId: string | null
  rssFeedItemId: string | null
  scopeCategory: 'global' | 'community_ai'
  scopeCommunityId: string | null
  completedAt: Date | null
}

export async function lockClassifierDecisionBatch(
  query: OwnedTransaction,
  batchId: string,
): Promise<LockedClassifierDecisionBatch | null> {
  const { rows } = await query<{
    classifier_id: string
    prompt_version_id: string
    post_id: string | null
    rss_feed_item_id: string | null
    scope_category: 'global' | 'community_ai'
    scope_community_id: string | null
    completed_at: Date | null
  }>(sql`
    /* lockClassifierDecisionBatch */
    SELECT classifier_id, prompt_version_id, post_id, rss_feed_item_id, scope_category,
      scope_community_id, completed_at
    FROM classifier_decision_batches
    WHERE id = ${batchId}
    FOR UPDATE
  `)
  const row = rows[0]
  if (!row) return null
  return {
    classifierId: row.classifier_id,
    promptVersionId: row.prompt_version_id,
    postId: row.post_id,
    rssFeedItemId: row.rss_feed_item_id,
    scopeCategory: row.scope_category,
    scopeCommunityId: row.scope_community_id,
    completedAt: row.completed_at,
  }
}

export async function readClassifierDecisionStoredCandidateSnapshots(
  query: OwnedTransaction,
  batchId: string,
): Promise<ReadonlyMap<string, ClassifierDecisionSnapshot>> {
  const { rows } = await query<ClassifierDecisionSnapshot>(sql`
    /* readClassifierDecisionStoredCandidateSnapshots */
    SELECT candidate_id, threshold_id,
      effective_lower_threshold::float8 AS effective_lower_threshold,
      effective_upper_threshold::float8 AS effective_upper_threshold
    FROM classifier_decision_batch_candidates
    WHERE batch_id = ${batchId}
    ORDER BY candidate_id
  `)
  return new Map(rows.map(row => [row.candidate_id, row]))
}

export async function completeClassifierDecisionBatch(
  query: OwnedTransaction,
  batchId: string,
): Promise<void> {
  const { rowCount } = await query(sql`
    /* completeClassifierDecisionBatch */
    UPDATE classifier_decision_batches
    SET completed_at = clock_timestamp()
    WHERE id = ${batchId} AND completed_at IS NULL
  `)
  if (rowCount !== 1) throw new Error('Classifier decision batch was not pending completion')
}
