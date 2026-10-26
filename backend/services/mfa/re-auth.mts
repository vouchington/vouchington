import { randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { createCodedError } from '@vouchington/sentry'
import { MFA_REAUTH_REQUIRED } from '@modules/on-error/error-codes'
import { isUUID } from '@ts-shared/utils/validation-core'
import type { AccountChangeSession } from './active-account-session.mts'

export const REAUTH_TTL_SECONDS = 300

/** Caller holds the live user and actor-session locks after verifying an actual factor. */
export async function createReAuthToken(
  currentUserId: string,
  session: AccountChangeSession,
  query: TransactionQuery,
): Promise<string> {
  const token = randomUUID()
  const { rowCount } = await query(
    `/* createReAuthToken */ UPDATE user_sessions
     SET account_change_proof = jsonb_build_object(
       'tokenHash', $4::text,
       'expiresAt', clock_timestamp() + ($5 * interval '1 second')
     )
     WHERE id = $1 AND user_id = $2 AND device_id = $3
       AND revoked_at IS NULL AND expires_at > clock_timestamp()`,
    [session.sid, currentUserId, session.did, proofHash(session.sid, token), REAUTH_TTL_SECONDS],
  )
  if (rowCount !== 1) throw freshAuthenticationRequired()
  return token
}

/** Clearing the proof participates in the actual account mutation's transaction and rollback. */
export async function verifyAndDeleteReAuthToken(
  currentUserId: string,
  session: AccountChangeSession,
  token: string,
  query: TransactionQuery,
): Promise<boolean> {
  if (!isUUID(token)) return false
  const { rowCount } = await query(
    `/* verifyAndDeleteReAuthToken */ UPDATE user_sessions
     SET account_change_proof = NULL
     WHERE id = $1 AND user_id = $2 AND device_id = $3
       AND revoked_at IS NULL AND expires_at > clock_timestamp()
       AND account_change_proof->>'tokenHash' = $4
       AND (account_change_proof->>'expiresAt')::timestamptz > clock_timestamp()`,
    [session.sid, currentUserId, session.did, proofHash(session.sid, token)],
  )
  return rowCount === 1
}

export async function assertFreshReAuth(
  currentUserId: string,
  session: AccountChangeSession,
  token: string | undefined,
  query: TransactionQuery,
): Promise<void> {
  assertAccountChangeProofFormat(token)
  if (!(await verifyAndDeleteReAuthToken(currentUserId, session, token, query))) {
    throw freshAuthenticationRequired()
  }
}

/** Reject an absent proof before expensive provider verification; consumption stays transactional. */
export function assertAccountChangeProofFormat(token: unknown): asserts token is string {
  if (typeof token !== 'string' || !isUUID(token)) throw freshAuthenticationRequired()
}

function proofHash(sessionId: string, token: string): string {
  return hashToken(`account-change-proof:${sessionId}`, token)
}

function freshAuthenticationRequired() {
  return createCodedError(403, 'Fresh authentication required', MFA_REAUTH_REQUIRED)
}
