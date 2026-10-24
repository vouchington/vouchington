/* oxlint-disable no-await-in-loop -- each capped composite-key page checkpoints one transaction. */
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { assertPositiveInteger } from './normalize-positive-integer.mts'

type CandidateKey = { batch_id: string; candidate_id: string }
type PageResult = { scanned: number; deleted: number; hasMore: boolean }

/** Raw keyset pages advance past batches still awaiting operator result retirement. */
export async function sweepClassifierBatchCandidates(
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
  maxBatches: number,
): Promise<PageResult> {
  assertPositiveInteger(batchSize, 'batchSize')
  assertPositiveInteger(maxBatches, 'maxBatches')
  let scanned = 0
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch++) {
    // no-mistakes-disable-next-line query-reached-per-item: at most maxBatches transactions read batchSize+1 raw composite keys and persist the cursor; protected result FKs can leave blocked rows in a page.
    const page = await sweepBatchCandidatePage(cutoffId, lowerBoundId, batchSize)
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, deleted, hasMore }
}

async function sweepBatchCandidatePage(
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
): Promise<PageResult> {
  await using query = await beginTransaction()
  await query(sql`/* ensureClassifierBatchCandidateCursor */
    INSERT INTO classifier_retention_cursors (sweep)
    VALUES ('batch_candidates') ON CONFLICT DO NOTHING`)
  const { rows: progress } = await query<{
    cursor_id: string | null
    cursor_child_id: string | null
    sweep_end_key: string | null
  }>(sql`/* lockClassifierBatchCandidateCursor */
    SELECT cursor_id, cursor_child_id, sweep_end_key
    FROM classifier_retention_cursors
    WHERE sweep = 'batch_candidates' FOR UPDATE`)
  const stored = progress[0]!
  const sweepEnd =
    stored.sweep_end_key !== null &&
    stored.sweep_end_key >= lowerBoundId &&
    stored.sweep_end_key <= cutoffId
      ? stored.sweep_end_key
      : cutoffId
  const cursor =
    stored.cursor_id !== null && stored.cursor_id >= lowerBoundId && stored.cursor_id < sweepEnd
      ? stored.cursor_id
      : null
  const statement = sql`/* listClassifierBatchCandidatePage */
    SELECT batch_id, candidate_id FROM classifier_decision_batch_candidates
    WHERE batch_id >= ${lowerBoundId} AND batch_id < ${sweepEnd}`
  if (cursor !== null && stored.cursor_child_id !== null) {
    statement.append(
      sql` AND (batch_id, candidate_id) > (${cursor}::uuid, ${stored.cursor_child_id}::uuid)`,
    )
  }
  statement.append(sql` ORDER BY batch_id, candidate_id LIMIT ${batchSize + 1}`)
  const { rows } = await query<CandidateKey>(statement)
  const page = rows.slice(0, batchSize)
  let deleted = 0
  if (page.length > 0) {
    const batchIds = page.map(row => row.batch_id)
    const candidateIds = page.map(row => row.candidate_id)
    const outcome = await query(sql`/* deleteOldClassifierBatchCandidates */
      DELETE FROM classifier_decision_batch_candidates AS target
      USING unnest(${batchIds}::uuid[], ${candidateIds}::uuid[]) AS selected(batch_id, candidate_id),
        classifier_decision_batches AS batch
      WHERE target.batch_id = selected.batch_id AND target.candidate_id = selected.candidate_id
        AND batch.id = target.batch_id AND batch.completed_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM classifier_runs AS run
          WHERE run.decision_batch_id = target.batch_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM classifier_decision_calls AS call
          WHERE call.batch_id = target.batch_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM topic_classifier_results AS result
          WHERE result.batch_id = target.batch_id AND result.candidate_id = target.candidate_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM story_classifier_results AS result
          WHERE result.batch_id = target.batch_id AND result.candidate_id = target.candidate_id
        )`)
    deleted = outcome.rowCount ?? 0
  }
  const hasMore = rows.length > batchSize
  const last = hasMore ? page.at(-1)! : null
  await query(sql`/* checkpointClassifierBatchCandidateCursor */
    UPDATE classifier_retention_cursors SET
      cursor_id = ${last?.batch_id ?? null},
      cursor_child_id = ${last?.candidate_id ?? null},
      sweep_end_key = ${hasMore ? sweepEnd : null}
    WHERE sweep = 'batch_candidates'`)
  await query.commit()
  return { scanned: page.length, deleted, hasMore }
}
