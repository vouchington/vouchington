import { runWithTransaction, write, type TransactionQuery } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'
import { BLUESKY_OAUTH_STATE_TTL_MS } from './lifecycle-constants.mts'

export type BlueskyLinkAuthorization = {
  id: string
  user_id: string
  initiating_session_id: string | null
  handle: string
  callback_mode: 'web' | 'native'
  status: 'pending' | 'callback_claimed' | 'handoff_ready' | 'attached'
  completion_proof_challenge: string | null
  claimed_did: string | null
  expires_at: Date
}

export async function createBlueskyLinkAuthorization(input: {
  userId: string
  handle: string
  callbackMode: 'web' | 'native'
  completionProofChallenge?: string
  initiatingSessionId: string
  query: TransactionQuery
}): Promise<string> {
  const authorizationId = v7()
  const expiresAt = new Date(Date.now() + BLUESKY_OAUTH_STATE_TTL_MS)
  return runWithTransaction(input.query, async query => {
    await query(sql`/* createBlueskyLinkAuthorization:lockActiveUser */
      SELECT fn_lock_active_user_for_mutation(${input.userId})`)
    await query(sql`/* createBlueskyLinkAuthorization */
      INSERT INTO bluesky_link_authorizations (
        id, user_id, initiating_session_id, handle, callback_mode, completion_proof_challenge, expires_at
      ) VALUES (
        ${authorizationId}, ${input.userId}, ${input.initiatingSessionId}, ${input.handle}, ${input.callbackMode},
        ${input.completionProofChallenge ?? null}, ${expiresAt}
      )`)

    return authorizationId
  })
}

export async function getBlueskyLinkAuthorizationForCallbackFromPrimary(
  authorizationId: string,
  loadedAuthorization?: BlueskyLinkAuthorization,
): Promise<BlueskyLinkAuthorization> {
  if (loadedAuthorization?.id === authorizationId) {
    return assertUsableBlueskyLinkAuthorization(loadedAuthorization)
  }
  const { rows } = await readBlueskyLinkAuthorization(authorizationId, write)
  return assertUsableBlueskyLinkAuthorization(rows[0])
}

function readBlueskyLinkAuthorization(authorizationId: string, query: QueryExecutor) {
  return query<BlueskyLinkAuthorization>(sql`/* readBlueskyLinkAuthorization */
    SELECT id, user_id, initiating_session_id, handle, callback_mode, status, completion_proof_challenge,
           claimed_did, expires_at
    FROM bluesky_link_authorizations
    WHERE id = ${authorizationId}
      AND status IN ('pending', 'callback_claimed', 'handoff_ready', 'attached')`)
}

function assertUsableBlueskyLinkAuthorization(
  authorization: BlueskyLinkAuthorization | undefined,
): BlueskyLinkAuthorization {
  if (!authorization || authorization.expires_at <= new Date()) {
    throw createHttpError(400, 'Invalid or expired Bluesky OAuth authorization')
  }
  return authorization
}

export async function rejectBlueskyLinkAuthorization(
  authorizationId: string,
  userId: string,
): Promise<void> {
  await write(sql`/* rejectBlueskyLinkAuthorization */
    UPDATE bluesky_link_authorizations
    SET rejected_at = clock_timestamp(), handle = NULL
    WHERE id = ${authorizationId}
      AND user_id = ${userId}
      AND status = 'pending'`)
}
