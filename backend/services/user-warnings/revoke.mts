import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/**
 * Revokes a user warning (marks it as lifted via appeal acceptance).
 * Idempotent: does nothing if already revoked.
 */
export async function revokeUserWarning(
  staffUserId: string,
  warningId: string,
  options?: QueryOptions,
): Promise<void> {
  await write(
    sql`/* revokeUserWarning */
    UPDATE user_warnings
    SET revoked_at = CURRENT_TIMESTAMP,
        revoked_by_id = ${staffUserId}
    WHERE id = ${warningId}
      AND revoked_at IS NULL
  `,
    options,
  )
}
