import { write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { UserDeletionExternalWorkKind } from './types.mts'

export async function addUserDeletionExternalWork(
  requestId: string,
  workKind: UserDeletionExternalWorkKind,
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
  workKind: UserDeletionExternalWorkKind,
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
