import type { TransactionQuery } from '@data-stores/psql'
import type {
  OperationalTombstoneCandidate,
  OperationalTombstoneCursor,
} from './cleanup-operational-tombstone-types.mts'
import type { Plan } from './cleanup-operational-tombstone-plans.mts'

export async function listCandidates(
  query: TransactionQuery,
  plan: Plan,
  cutoff: Date,
  limit: number,
  cursor: OperationalTombstoneCursor,
): Promise<OperationalTombstoneCandidate[]> {
  const parameters: unknown[] = [cutoff]
  const afterCursor =
    cursor.cursor_at && cursor.cursor_record_id
      ? `AND (${plan.timestamp}, source.id) >
       ($${parameters.push(cursor.cursor_at)}::timestamptz, $${parameters.push(cursor.cursor_record_id)}::uuid)`
      : ''
  const limitParameter = parameters.push(limit)
  // Text transport preserves PostgreSQL's microseconds, unlike node-postgres Date parsing.
  const { rows } = await query<OperationalTombstoneCandidate>(
    `/* no-mistakes: deadlock-safe -- each fixed family locks one ordered indexed page with SKIP LOCKED, then deletes that page in the same transaction. */
     /* listOperationalTombstoneCandidates */
     SELECT source.id, ${plan.timestamp}::text AS position_at
     FROM ${plan.table} source
     WHERE ${plan.timestamp} < $1::timestamptz
       AND ${plan.candidatePredicate ?? plan.predicate}
       ${afterCursor}
     ORDER BY ${plan.timestamp}, source.id
     LIMIT $${limitParameter}
     FOR UPDATE OF source SKIP LOCKED`,
    parameters,
  )
  return rows
}

export async function hasMoreCandidates(
  query: TransactionQuery,
  plan: Plan,
  cutoff: Date,
  last: OperationalTombstoneCandidate,
): Promise<boolean> {
  const { rows } = await query(
    `/* hasMoreOperationalTombstoneCandidates */
     SELECT 1 FROM ${plan.table} source
     WHERE ${plan.timestamp} < $1::timestamptz
       AND ${plan.candidatePredicate ?? plan.predicate}
       AND (${plan.timestamp}, source.id) > ($2::timestamptz, $3::uuid)
     ORDER BY ${plan.timestamp}, source.id
     LIMIT 1`,
    [cutoff, last.position_at, last.id],
  )
  return rows.length > 0
}
