import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { assertRetainedActiveDecisionReservation } from './classifier-retained-active-reservation.mts'
import {
  assertClassifierBatchWithinRetention,
  isClassifierBatchWithinRetention,
} from './retention-window.mts'
import type { PersistClassifierDecisionInput } from './types.mts'

export async function insertClassifierDecisionBatch(
  query: OwnedTransaction,
  input: Pick<
    PersistClassifierDecisionInput,
    'batchId' | 'classifierId' | 'promptVersionId' | 'scope' | 'subject'
  >,
  activeRunId?: string,
): Promise<boolean> {
  if (!isClassifierBatchWithinRetention(input.batchId) && !activeRunId) {
    assertClassifierBatchWithinRetention(input.batchId)
  }
  // ON CONFLICT (id) misses a concurrent duplicate on a composite unique index. Hash
  // canonical uuid text so mixed-case spellings of one batch take that same lock.
  await query(sql`/* insertClassifierDecisionBatch:lock */
    SELECT pg_advisory_xact_lock(hashtextextended('classifier-decision-batch:' || ${input.batchId}::uuid::text, 0))
  `)
  if (!isClassifierBatchWithinRetention(input.batchId)) {
    await assertRetainedActiveDecisionReservation(query, activeRunId!, input.batchId)
    return false
  }
  const { rowCount } = await query(sql`
    /* insertClassifierDecisionBatch */
    INSERT INTO classifier_decision_batches (
      id, classifier_id, prompt_version_id, post_id, rss_feed_item_id, scope_category,
      scope_community_id
    ) VALUES (
      ${input.batchId}, ${input.classifierId}, ${input.promptVersionId}, ${input.subject.postId},
      ${input.subject.rssFeedItemId}, ${input.scope.scopeCategory}, ${input.scope.scopeCommunityId}
    ) ON CONFLICT (id) DO NOTHING
  `)
  return rowCount === 1
}
