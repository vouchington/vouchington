import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { readResults, toScope } from './read-complete-decision-results.mts'
import type { ClassifierDecisionScope, PersistedClassifierDecision } from './types.mts'

type BatchRow = {
  id: string
  classifier_id: string
  prompt_version_id: string
  post_id: string | null
  rss_feed_item_id: string | null
  scope_category: ClassifierDecisionScope['scopeCategory']
  scope_community_id: string | null
}

type CallRow = { id: string; shard_ordinal: number }

export async function readCompleteClassifierDecision(
  query: QueryExecutor,
  batchId: string,
  candidateKind: 'topic' | 'story',
): Promise<PersistedClassifierDecision> {
  const batch = await readBatchRow(query, batchId)
  if (!batch) throw new Error('Classifier decision batch disappeared before replay verification')
  return assembleCompleteClassifierDecision(query, batch, candidateKind)
}

/**
 * Reads a committed classifier decision batch by ID without throwing when it does not (yet)
 * exist. A C6-style caller uses this before dispatching to the provider: the batch and its calls
 * and results are written atomically in one transaction (see `persistClassifierDecision`), so
 * finding the batch row means the whole decision is already committed and safe to recover instead
 * of re-dispatching.
 *
 * Always reads the primary, never a caller-supplied executor: a replica can lag behind the commit,
 * and a false "not found" here would make the caller re-dispatch and then fail to persist under the
 * same stable batch ID ("batch ID was reused with different results") instead of recovering.
 */
export async function readCompleteClassifierDecisionIfExistsFromPrimary(
  batchId: string,
  candidateKind: 'topic' | 'story',
): Promise<PersistedClassifierDecision | null> {
  const batch = await readBatchRow(write, batchId)
  if (!batch) return null
  return assembleCompleteClassifierDecision(write, batch, candidateKind)
}

async function assembleCompleteClassifierDecision(
  query: QueryExecutor,
  batch: BatchRow,
  candidateKind: 'topic' | 'story',
): Promise<PersistedClassifierDecision> {
  const [calls, results] = await Promise.all([
    readCalls(query, batch.id),
    readResults(query, batch.id, candidateKind),
  ])
  return {
    batchId: batch.id,
    classifierId: batch.classifier_id,
    promptVersionId: batch.prompt_version_id,
    scope: toScope(batch.scope_category, batch.scope_community_id),
    subject: toSubject(batch.post_id, batch.rss_feed_item_id),
    calls,
    results,
  }
}

async function readBatchRow(query: QueryExecutor, batchId: string): Promise<BatchRow | null> {
  const { rows } = await query<BatchRow>(sql`
    /* readCompleteClassifierDecisionBatch */
    SELECT id, classifier_id, prompt_version_id, post_id, rss_feed_item_id, scope_category,
      scope_community_id
    FROM classifier_decision_batches
    WHERE id = ${batchId}
    FOR SHARE
  `)
  return rows[0] ?? null
}

async function readCalls(
  query: QueryExecutor,
  batchId: string,
): Promise<PersistedClassifierDecision['calls']> {
  const { rows } = await query<CallRow>(sql`
    /* readCompleteClassifierDecisionCalls */
    SELECT id, shard_ordinal FROM classifier_decision_calls
    WHERE batch_id = ${batchId} ORDER BY shard_ordinal
  `)
  return rows.map(row => ({ id: row.id, shardOrdinal: row.shard_ordinal }))
}

function toSubject(
  postId: string | null,
  rssFeedItemId: string | null,
): PersistedClassifierDecision['subject'] {
  if (postId && rssFeedItemId === null) return { postId, rssFeedItemId }
  if (postId === null && rssFeedItemId) return { postId, rssFeedItemId }
  throw new Error('Classifier decision contains an invalid persisted subject')
}
