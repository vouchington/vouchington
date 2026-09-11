import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { attachDerivedStatus } from './derive-status.mts'
import type { UserDataRequest, UserDataRequestRow } from './types.mts'

export async function createDataRequest(userId: string): Promise<UserDataRequest> {
  await using query = await beginTransaction()
  await query(sql`/* createDataRequest */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  const { rows } = await query(sql`/* createDataRequest */
      INSERT INTO user_data_requests (user_id)
      VALUES (${userId})
      RETURNING
        id,
        user_id,
        queued_at,
        processing_attempt_id,
        dispatched_at,
        processing_attempts,
        processing_started_at,
        completed_at,
        failed_at,
        last_error_message,
        s3_key,
        expires_at,
        uuid_extract_timestamp(id) AS created_at,
        updated_at
    `)
  await query.commit()
  return attachDerivedStatus(rows[0] as UserDataRequestRow)
}
