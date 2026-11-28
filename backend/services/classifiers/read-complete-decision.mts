import { write, type OwnedTransaction, type QueryExecutor } from '@data-stores/psql'
import type { ClassifierCandidateKind } from '@voucha/types'
import sql from 'sql-template-strings'
import { assertRetainedActiveDecisionReservation } from './classifier-retained-active-reservation.mts'
import { readResults, toScope } from './read-complete-decision-results.mts'
import { assertClassifierBatchWithinRetention } from './retention-window.mts'
import type { ClassifierDecisionScope, PersistedClassifierDecision } from './types.mts'
import { getClassifiersWorkLimit } from './work-limits.mts'

type BatchRow = {
  id: string
  classifier_id: string
  prompt_version_id: string
  post_id: string | null
  rss_feed_item_id: string | null
  scope_category: ClassifierDecisionScope['scopeCategory']
  scope_community_id: string | null
  completed_at: Date | null
}

type CallRow = { id: string; shard_ordinal: number }

export async function readCompleteClassifierDecision(
  query: QueryExecutor,
  batchId: string,
  candidateKind: ClassifierCandidateKind,
): Promise<PersistedClassifierDecision> {
  assertClassifierBatchWithinRetention(batchId)
  const batch = await readBatchRow(query, batchId)
  if (!batch) throw new Error('Classifier decision batch disappeared before replay verification')
  if (batch.completed_at === null) {
    throw new Error('Classifier decision batch is reserved but not complete')
  }
  return assembleCompleteClassifierDecision(query, batch, candidateKind)
}

/**
 * Reads a committed classifier decision batch by ID without throwing when it does not (yet)
 * exist. A C6-style caller uses this before dispatching to the provider: the batch and its calls
 * and results are written atomically in one transaction (see `persistClassifierDecision`). A
 * pre-reserved batch has no completion marker, so it intentionally reads as absent until its exact
 * provider result is committed.
 *
 * Always reads the primary, never a caller-supplied executor: a replica can lag behind the commit,
 * and a false "not found" here would make the caller re-dispatch and then fail to persist under the
 * same stable batch ID ("batch ID was reused with different results") instead of recovering.
 */
export async function readCompleteClassifierDecisionIfExistsFromPrimary(
  batchId: string,
  candidateKind: ClassifierCandidateKind,
): Promise<PersistedClassifierDecision | null> {
  assertClassifierBatchWithinRetention(batchId)
  const batch = await readBatchRow(write, batchId)
  if (!batch || batch.completed_at === null) return null
  return assembleCompleteClassifierDecision(write, batch, candidateKind)
}

/** An unfinished run retains its committed decision beyond the public replay window. */
export async function readCompleteClassifierDecisionForActiveRun(
  query: QueryExecutor,
  runId: string,
  batchId: string,
  candidateKind: ClassifierCandidateKind,
): Promise<PersistedClassifierDecision> {
  const { rows } = await query<{ id: string }>(sql`
    /* readCompleteClassifierDecisionActiveRun */
    SELECT id FROM classifier_runs
    WHERE id = ${runId} AND decision_batch_id = ${batchId}
      AND outcomes_persisted_at IS NOT NULL
      AND completed_at IS NULL AND superseded_at IS NULL AND terminal_failed_at IS NULL

  `)
  if (!rows[0]) throw new RangeError('Classifier decision batch is outside the retention window')
  const batch = await readBatchRow(query, batchId)
  if (!batch?.completed_at) throw new Error('Active classifier run lost its committed decision')
  return assembleCompleteClassifierDecision(query, batch, candidateKind)
}

/** Readback for a leased run that has just persisted its reserved decision in this transaction. */
export async function readCompleteClassifierDecisionForActiveReservation(
  query: OwnedTransaction,
  runId: string,
  batchId: string,
  candidateKind: ClassifierCandidateKind,
): Promise<PersistedClassifierDecision> {
  await assertRetainedActiveDecisionReservation(query, runId, batchId)
  const batch = await readBatchRow(query, batchId)
  if (!batch?.completed_at) throw new Error('Active classifier reservation is not complete')
  return assembleCompleteClassifierDecision(query, batch, candidateKind)
}

async function assembleCompleteClassifierDecision(
  query: QueryExecutor,
  batch: BatchRow,
  candidateKind: ClassifierCandidateKind,
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
      scope_community_id, completed_at
    FROM classifier_decision_batches
    WHERE id = ${batchId}

  `)
  return rows[0] ?? null
}

async function readCalls(
  query: QueryExecutor,
  batchId: string,
): Promise<PersistedClassifierDecision['calls']> {
  const pageSize = getClassifiersWorkLimit('decision_calls_page_size')
  const calls: Array<{ id: string; shardOrdinal: number }> = []
  let afterOrdinal: number | null = null
  while (true) {
    const cursorOrdinal: number | null = afterOrdinal
    // oxlint-disable-next-line no-await-in-loop -- keyset page advances sequentially through one batch's decision calls
    const result: { rows: CallRow[] } = await query<CallRow>( // no-mistakes-disable-line query-reached-per-item: keyset pagination over one decision batch's shard calls in DynamicConfig decision_calls_page_size pages (hard max 1000)
      sql`
        /* readCompleteClassifierDecisionCalls */
        SELECT id, shard_ordinal FROM classifier_decision_calls
        WHERE batch_id = ${batchId}
          AND (${cursorOrdinal}::integer IS NULL OR shard_ordinal > ${cursorOrdinal}::integer)
        ORDER BY shard_ordinal ASC
        LIMIT ${pageSize}
      `,
    )
    for (const row of result.rows) {
      calls.push({ id: row.id, shardOrdinal: row.shard_ordinal })
    }
    if (result.rows.length < pageSize) break
    afterOrdinal = result.rows.at(-1)!.shard_ordinal
  }
  return calls
}

function toSubject(
  postId: string | null,
  rssFeedItemId: string | null,
): PersistedClassifierDecision['subject'] {
  if (postId && rssFeedItemId === null) return { postId, rssFeedItemId }
  if (postId === null && rssFeedItemId) return { postId, rssFeedItemId }
  throw new Error('Classifier decision contains an invalid persisted subject')
}
