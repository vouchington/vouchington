import type { TransactionQuery } from '@data-stores/psql'
import type { Plan, Cursor, Candidate } from './cleanup-operational-tombstones.mts'

export async function listCandidates(
  query: TransactionQuery,
  plan: Plan,
  cutoff: Date,
  limit: number,
  cursor: Cursor,
  lowerBoundDate?: Date,
): Promise<Candidate[]> {
  const parameters: unknown[] = [cutoff]
  const lowerBound = lowerBoundDate
    ? `AND ${plan.timestamp} >= $${parameters.push(lowerBoundDate)}::timestamptz`
    : ''
  const afterCursor =
    cursor.cursor_at && cursor.cursor_id
      ? `AND (${plan.timestamp}, source.id) >
       ($${parameters.push(cursor.cursor_at)}::timestamptz, $${parameters.push(cursor.cursor_id)}::uuid)`
      : ''
  const limitParameter = parameters.push(limit)
  // Text transport preserves PostgreSQL's microseconds, unlike node-postgres Date parsing.
  const { rows } = await query<Candidate>(
    `/* no-mistakes: deadlock-safe -- each fixed family locks one ordered indexed page with SKIP LOCKED, then deletes that page in the same transaction. */
     /* listOperationalTombstoneCandidates */
     SELECT source.id, ${plan.timestamp}::text AS position_at
     FROM ${plan.table} source
     WHERE ${plan.timestamp} < $1::timestamptz
       ${lowerBound}
       AND ${plan.predicate}
       ${afterCursor}
     ORDER BY ${plan.timestamp}, source.id
     LIMIT $${limitParameter}
     FOR UPDATE OF source SKIP LOCKED`,
    parameters,
  )
  return rows
}
