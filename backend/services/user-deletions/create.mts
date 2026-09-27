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
    return await createValidatedUserDeletionRequest(
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
  const { rows: users } = await query<{
    target_exists: boolean
    requester_exists: boolean
  }>(sql`/* createUserDeletionRequest:validateUsers */
    WITH live_users AS MATERIALIZED (
      SELECT id FROM users WHERE id = ${userId} OR id = ${requestedById}
    ), retained_users AS MATERIALIZED (
      SELECT identity.id FROM retained_user_identities identity
      JOIN live_users live ON live.id = identity.id
      ORDER BY identity.id FOR KEY SHARE OF identity
    )
    SELECT EXISTS (SELECT 1 FROM retained_users WHERE id = ${userId}) AS target_exists,
      (${requestedById}::uuid IS NULL OR EXISTS (SELECT 1 FROM retained_users WHERE id = ${requestedById})) AS requester_exists
  `)
  assert(users[0]?.target_exists, 409, 'User is already deleted')
  assert(users[0]?.requester_exists, 409, 'Requesting user does not exist')
  const { rows } = await query(sql`/* createUserDeletionRequest */
    INSERT INTO user_deletion_requests (user_id, requested_by_id, prior_username)
    VALUES (${userId}, ${requestedById}, ${priorUsername ?? null})
    ON CONFLICT (user_id) DO UPDATE
    SET requested_by_id = EXCLUDED.requested_by_id,
        prior_username = COALESCE(user_deletion_requests.prior_username, EXCLUDED.prior_username)
    RETURNING id, user_id, requested_by_id, processing_attempt_id, current_phase,
      processing_started_at, processing_attempts, completed_at
  `)
  return mapUserDeletionRequest(rows[0] as UserDeletionRequestRow)
}
