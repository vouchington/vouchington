import { write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { UserDeletionProviderWorkKind } from './types.mts'

export async function addUserDeletionExternalWorks(
  requestId: string,
  workKind: UserDeletionProviderWorkKind,
  workKeys: readonly string[],
  query: QueryExecutor = write,
): Promise<void> {
  if (workKeys.length === 0) return
  await query(sql`/* addUserDeletionExternalWork */
    INSERT INTO user_deletion_external_works (request_id, work_kind, work_key)
    SELECT ${requestId}, ${workKind}, work_key
    FROM UNNEST(${workKeys}::text[]) AS work_keys(work_key)
    ORDER BY work_key
    ON CONFLICT (request_id, work_kind, work_key) DO NOTHING
  `)
}

export async function completeUserDeletionExternalWorks(
  requestId: string,
  workKind: UserDeletionProviderWorkKind,
  workKeys: readonly string[],
): Promise<void> {
  if (workKeys.length === 0) return
  await write(sql`/* completeUserDeletionExternalWork */
    UPDATE user_deletion_external_works
    SET completed_at = CURRENT_TIMESTAMP,
        last_error_message = NULL
    WHERE request_id = ${requestId}
      AND work_kind = ${workKind}
      AND work_key = ANY(${workKeys}::text[])
      AND completed_at IS NULL
  `)
}

export async function addUserDeletionRelationEffects(
  requestId: string,
  impactIds: readonly string[],
  query: QueryExecutor = write,
): Promise<void> {
  if (impactIds.length === 0) return
  await query(sql`/* addUserDeletionRelationEffects */
    INSERT INTO user_deletion_external_works (request_id, work_kind, relation_impact_id)
    SELECT ${requestId}::uuid, 'entity-relation-effects', impact.id
    FROM user_deletion_relation_impacts impact
    WHERE impact.request_id = ${requestId} AND impact.id = ANY(${impactIds}::uuid[])
    ORDER BY impact.id
    ON CONFLICT (request_id, relation_impact_id) DO NOTHING
  `)
}
