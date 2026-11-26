import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { mapUserDeletionRequest, type UserDeletionRequestRow } from './row.mts'
import type { UserDeletionRequest } from './types.mts'

export async function createUserDeletionRequest(
  userId: string,
  requestedById: string | null,
  options: { priorUsername?: string | null; query?: TransactionQuery } = {},
): Promise<UserDeletionRequest> {
  if (options.query) {
    return createValidatedUserDeletionRequest(
      options.query,
      userId,
      requestedById,
      options.priorUsername,
    )
  }
  await using query = await beginTransaction()
  const request = await createValidatedUserDeletionRequest(
    query,
    userId,
    requestedById,
    options.priorUsername,
  )
  await query.commit()
  return request
}

async function createValidatedUserDeletionRequest(
  query: TransactionQuery,
  userId: string,
  requestedById: string | null,
  priorUsername?: string | null,
): Promise<UserDeletionRequest> {
  try {
    const { rows } = await query<UserDeletionRequestRow>(sql`/* createUserDeletionRequest */
      INSERT INTO user_deletion_requests (user_id, requested_by_id, prior_username)
      SELECT target.id, ${requestedById}::uuid, ${priorUsername ?? null}::text
      FROM users target
      WHERE target.id = ${userId}
        AND (${requestedById}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM users requester WHERE requester.id = ${requestedById}
        ))
      ON CONFLICT (user_id) DO UPDATE
      SET requested_by_id = EXCLUDED.requested_by_id,
          prior_username = COALESCE(user_deletion_requests.prior_username, EXCLUDED.prior_username)
      RETURNING id, user_id, requested_by_id, processing_attempt_id, current_phase,
        processing_started_at, processing_attempts, completed_at
    `)
    const request = rows[0]
    if (request) return mapUserDeletionRequest(request)
  } catch (err) {
    const failure = err as { code?: string; constraint?: string }
    if (failure.code === '23503') {
      if (failure.constraint === 'user_deletion_requests_user_id_fkey')
        assert(false, 409, 'User is already deleted', { cause: err })
      if (failure.constraint === 'user_deletion_requests_requested_by_id_fkey')
        assert(false, 409, 'Requesting user does not exist', { cause: err })
    }
    throw err
  }

  const { rows: targets } = await query<{ id: string }>(sql`/* createUserDeletionRequest:target */
    SELECT id FROM users WHERE id = ${userId}
  `)
  assert(targets.length > 0, 409, 'User is already deleted')
  assert(false, 409, 'Requesting user does not exist')
}
