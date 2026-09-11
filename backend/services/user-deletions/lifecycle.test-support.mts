import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { mapUserDeletionRequest, type UserDeletionRequestRow } from './row.mts'
import type { UserDeletionRequest } from './types.mts'

export async function makeUserDeletionRecoverableForTest(
  requestId: string,
  mode: 'unstarted' | 'stale',
): Promise<void> {
  await write(sql`/* makeUserDeletionRecoverableForTest */
    UPDATE user_deletion_requests
    SET dispatched_at = NOW() - INTERVAL '31 minutes',
        processing_started_at = CASE
          WHEN ${mode} = 'stale' THEN NOW() - INTERVAL '31 minutes'
          ELSE NULL
        END
    WHERE id = ${requestId}
  `)
}

export async function completeUserDeletionForTest(requestId: string): Promise<void> {
  await write(sql`/* completeUserDeletionForTest */
    UPDATE user_deletion_requests
    SET completed_at = NOW()
    WHERE id = ${requestId}
  `)
}

export async function addUserDeletionRelationImpactForTest(
  requestId: string,
  recomputed: boolean,
): Promise<string> {
  const { rows } = await write(sql`/* addUserDeletionRelationImpactForTest */
    INSERT INTO user_deletion_relation_impacts (
      request_id,
      relation_table,
      entity_relation_id,
      recomputed_at
    )
    VALUES (
      ${requestId},
      'entity_relations',
      uuidv7(),
      CASE WHEN ${recomputed} THEN CURRENT_TIMESTAMP END
    )
    RETURNING id
  `)
  return (rows[0] as { id: string }).id
}

export async function completeUserDeletionRelationImpactForTest(impactId: string): Promise<void> {
  await write(sql`/* completeUserDeletionRelationImpactForTest */
    UPDATE user_deletion_relation_impacts
    SET recomputed_at = CURRENT_TIMESTAMP
    WHERE id = ${impactId}
  `)
}

export async function getUserDeletionRelationImpactIdsForTest(
  requestId: string,
): Promise<string[]> {
  const { rows } = await read(sql`/* getUserDeletionRelationImpactIdsForTest */
    SELECT id
    FROM user_deletion_relation_impacts
    WHERE request_id = ${requestId}
    ORDER BY id
  `)
  return rows.map(row => (row as { id: string }).id)
}

export async function getUserDeletionRequestForTest(
  requestId: string,
): Promise<UserDeletionRequest | null> {
  const { rows } = await read(sql`/* getUserDeletionRequestForTest */
    SELECT id, user_id, requested_by_id, processing_attempt_id, current_phase,
      processing_started_at, processing_attempts, completed_at
    FROM user_deletion_requests
    WHERE id = ${requestId}
  `)
  const row = rows[0] as UserDeletionRequestRow | undefined
  return row ? mapUserDeletionRequest(row) : null
}

export async function getUserDeletionDispatchedAtForTest(requestId: string): Promise<Date | null> {
  const { rows } = await write<{ dispatched_at: Date }>(sql`/* getUserDeletionDispatchedAtForTest */
    SELECT dispatched_at FROM user_deletion_requests WHERE id = ${requestId}
  `)
  return rows[0]?.dispatched_at ?? null
}

export async function getUserDeletionCompletionAuditForTest(requestId: string): Promise<{
  priorUsername: string | null
  externalWorks: {
    id: string
    workKind: string
    workKey: string
    requestedAt: Date
    completedAt: Date | null
  }[]
}> {
  const { rows } = await read(sql`/* getUserDeletionCompletionAuditForTest */
    SELECT request.prior_username, work.id, work.work_kind, work.work_key,
      work.requested_at, work.completed_at
    FROM user_deletion_requests request
    INNER JOIN user_deletion_external_works work ON work.request_id = request.id
    WHERE request.id = ${requestId}
    ORDER BY work.id
  `)
  return {
    priorUsername:
      (rows[0] as { prior_username: string | null } | undefined)?.prior_username ?? null,
    externalWorks: rows.map(row => {
      const work = row as {
        id: string
        work_kind: string
        work_key: string
        requested_at: Date
        completed_at: Date | null
      }
      return {
        id: work.id,
        workKind: work.work_kind,
        workKey: work.work_key,
        requestedAt: work.requested_at,
        completedAt: work.completed_at,
      }
    }),
  }
}
