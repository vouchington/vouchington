import { write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { UserDeletionProviderWorkKind } from './types.mts'

export async function addUserDeletionExternalWork(
  requestId: string,
  workKind: UserDeletionProviderWorkKind,
  workKey: string,
  query: QueryExecutor = write,
): Promise<void> {
  await query(sql`/* addUserDeletionExternalWork */
    INSERT INTO user_deletion_external_works (request_id, work_kind, work_key)
    VALUES (${requestId}, ${workKind}, ${workKey})
    ON CONFLICT (request_id, work_kind, work_key) DO NOTHING
  `)
}

export async function completeUserDeletionExternalWork(
  requestId: string,
  workKind: UserDeletionProviderWorkKind,
  workKey: string,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* completeUserDeletionExternalWork */
    UPDATE user_deletion_external_works
    SET completed_at = CURRENT_TIMESTAMP,
        last_error_message = NULL
    WHERE request_id = ${requestId}
      AND work_kind = ${workKind}
      AND work_key = ${workKey}
      AND completed_at IS NULL
  `)
  return (rowCount ?? 0) > 0
}

export async function addUserDeletionRelationEffects(
  requestId: string,
  impactIds: readonly string[],
  query: QueryExecutor = write,
): Promise<void> {
  if (impactIds.length === 0) return
  await query(sql`/* addUserDeletionRelationEffects */
    INSERT INTO user_deletion_external_works (request_id, work_kind, relation_impact_id)
    SELECT ${requestId}::uuid AS request_id, 'entity-relation-effects', impact.id
    FROM user_deletion_relation_impacts impact
    WHERE impact.request_id = ${requestId} AND impact.id = ANY(${impactIds}::uuid[])
    ORDER BY request_id, impact.id
    ON CONFLICT (request_id, relation_impact_id) DO NOTHING
  `)
}
