import type { TransactionQuery } from '@data-stores/psql'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'

/**
 * Serializes opposite directions of the same symmetric relation before either physical direction
 * is written. The relation table plus the unordered UUID pair is one transaction-scoped key.
 */
export async function lockBidirectionalRelationPairs(
  query: TransactionQuery,
  relationTable: string,
  subjectId: string,
  objectIds: readonly string[],
): Promise<void> {
  if (objectIds.length === 0) return
  await query(
    `/* lockBidirectionalRelationPairs */
    WITH pairs AS (
      SELECT LEAST($2::uuid, object_id) AS first_id, GREATEST($2::uuid, object_id) AS second_id
      FROM unnest($3::uuid[]) AS input(object_id)
      GROUP BY first_id, second_id
    )
    SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || first_id::text || ':' || second_id::text, 0))
    FROM pairs
    ORDER BY first_id, second_id`,
    [relationTable, subjectId, objectIds],
  )
}

/** Acquires every bidirectional mutation fence in the one required global order. */
export async function lockBidirectionalRelationMutation(
  query: TransactionQuery,
  relationTable: string,
  subjectId: string,
  objectIds: readonly string[],
  userSubjectIds: readonly string[],
): Promise<void> {
  await lockBidirectionalRelationPairs(query, relationTable, subjectId, objectIds)
  await lockActiveUserSubjectsForMutation(query, userSubjectIds)
}
