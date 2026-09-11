import { write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { mapUserDeletionRequest, type UserDeletionRequestRow } from './row.mts'
import type { UserDeletionRequest } from './types.mts'

export async function createUserDeletionRequest(
  userId: string,
  requestedById: string | null,
  options: { priorUsername?: string | null; query?: QueryExecutor } = {},
): Promise<UserDeletionRequest> {
  const query = options.query ?? write
  const { rows } = await query(sql`/* createUserDeletionRequest */
    INSERT INTO user_deletion_requests (user_id, requested_by_id, prior_username)
    VALUES (${userId}, ${requestedById}, ${options.priorUsername ?? null})
    ON CONFLICT (user_id) DO UPDATE
    SET requested_by_id = EXCLUDED.requested_by_id,
        prior_username = COALESCE(user_deletion_requests.prior_username, EXCLUDED.prior_username)
    RETURNING id, user_id, requested_by_id, processing_attempt_id, current_phase,
      processing_started_at, processing_attempts, completed_at
  `)
  return mapUserDeletionRequest(rows[0] as UserDeletionRequestRow)
}
