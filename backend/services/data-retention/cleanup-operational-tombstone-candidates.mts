import type { TransactionQuery } from '@data-stores/psql'
import type {
  OperationalTombstoneCandidate,
  OperationalTombstoneCursor,
  OperationalTombstonePageResult,
} from './cleanup-operational-tombstone-types.mts'
import { PLANS, type Plan } from './cleanup-operational-tombstone-plans.mts'

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
  // lock-reason: prevents: cascading away a remote Follow that commits mid-retention; writer: inbound Follow from a remote actor.
  // lock-reason: prevents: unbounded SET NULL of newly attached hostname dependents after the capped drain; writer: hostname-block descendant attachment and penalty creation.
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

export async function deleteUnreferencedTombstonePage(
  query: TransactionQuery,
  family: 'activitypub_post_likes' | 'app_attestation_keys',
  cutoff: Date,
  limit: number,
): Promise<OperationalTombstonePageResult> {
  const plan = PLANS[family]
  // Collect the bounded IDs first so generic plans use primary-key probes for the delete.
  const { rows } = await query<OperationalTombstoneCandidate>(
    `/* deleteUnreferencedTombstonePage */
     WITH deleted AS (
       DELETE FROM ${plan.table} source
       WHERE source.id = ANY(ARRAY(
         /* listOperationalTombstoneCandidates */
         SELECT source.id FROM ${plan.table} source
         WHERE ${plan.timestamp} < $1::timestamptz
           AND ${plan.predicate}
         ORDER BY ${plan.timestamp}, source.id
         LIMIT $2
       ))
       AND ${plan.timestamp} < $1::timestamptz
       AND ${plan.predicate}
       RETURNING source.id, ${plan.timestamp} AS position_at
     )
     SELECT deleted.id, deleted.position_at::text AS position_at
     FROM deleted ORDER BY deleted.position_at, deleted.id`,
    [cutoff, limit],
  )
  // Only rows returned by DELETE count toward a full page.
  const last = rows[limit - 1]
  const continuation = last ? { at: last.position_at, id: last.id } : null
  return { deleted: rows.length, hasMore: continuation !== null, continuation, stalled: false }
}
