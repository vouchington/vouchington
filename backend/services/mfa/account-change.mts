import { revokeOtherAuthenticatedSessions } from '@services/jwt-session/user-session-revocation'
import { sessionLimitsMaxValues } from '@services/jwt-session/session-limits-config'
import {
  read,
  registerPostCommitAction,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueSendAccountSecurityEmail } from '@queues/emails/enqueues'
import { sessionReloginRequired } from '@services/jwt-session/device-authority'
import { assertAccountChangeProofFormat, assertFreshReAuth } from './re-auth.mts'
import { withActiveAccountSession, type AccountChangeSession } from './active-account-session.mts'

/** The actor, recipient, one-use proof and actual change share one durable transaction. */
export async function withReauthenticatedAccountChange<T>(
  currentUserId: string,
  session: AccountChangeSession,
  reAuthToken: string | undefined,
  change: (query: TransactionQuery) => Promise<T>,
  options?: { serializable?: boolean },
): Promise<T> {
  return withActiveAccountSession(
    currentUserId,
    session,
    async query => {
      const actorSessionLocked = await lockSessionsAccountChangeWillWrite(
        query,
        currentUserId,
        session.sid,
      )
      return finishReauthenticatedAccountChange(
        currentUserId,
        session,
        reAuthToken,
        change,
        query,
        actorSessionLocked,
      )
    },
    options,
  )
}

async function finishReauthenticatedAccountChange<T>(
  currentUserId: string,
  session: AccountChangeSession,
  reAuthToken: string | undefined,
  change: (query: TransactionQuery) => Promise<T>,
  query: TransactionQuery,
  actorSessionLocked: boolean,
): Promise<T> {
  const oldEmail = await authorizeAccountChange(
    currentUserId,
    session,
    reAuthToken,
    query,
    actorSessionLocked,
  )
  const result = await applyAccountChange(currentUserId, session.sid, change, query)
  registerPostCommitAction(query, () => notifyAccountSecurityChange(oldEmail))
  return result
}

export async function captureAccountSecurityAddress(
  userId: string,
  options?: QueryOptions,
): Promise<string | undefined> {
  const { rows } = await read<{ email_address: string }>(
    sql`/* accountChangePrimaryEmail */
    SELECT email_address FROM user_email_addresses WHERE user_id = ${userId} AND is_primary = TRUE
  `,
    options,
  )
  return rows[0]?.email_address
}

export async function notifyAccountSecurityChange(oldEmail: string | undefined): Promise<void> {
  if (oldEmail) await enqueueSendAccountSecurityEmail({ emailAddress: oldEmail }, {})
}

/**
 * Locks the actor session the proof update writes and the sessions the revocation update writes,
 * in `id` order. The inner limit is the same active-session candidate set revocation uses.
 * When the actor session is already revoked or expired, the statement locks nothing.
 */
async function lockSessionsAccountChangeWillWrite(
  query: TransactionQuery,
  currentUserId: string,
  actorSessionId: string,
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `/* lockSessionsAccountChangeWillWrite */
     SELECT id
     FROM user_sessions
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
       AND (
         id = $2
         OR id IN (
           SELECT id
           -- no-mistakes-disable-next-line postgres-required-predicates: a SID may be minted before its owning user, so every session-ID partition can hold an active session for this user
           FROM user_sessions
           WHERE user_id = $1
             AND revoked_at IS NULL
             AND expires_at > CURRENT_TIMESTAMP
           ORDER BY expires_at, id
           LIMIT $3
         )
       )
       AND EXISTS (
         SELECT 1
         FROM user_sessions
         WHERE id = $2
           AND user_id = $1
           AND revoked_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP
       )
     ORDER BY id ASC NULLS LAST
     FOR NO KEY UPDATE`,
    [currentUserId, actorSessionId, sessionLimitsMaxValues.active_sessions_per_user],
  )
  return rows.some(row => row.id === actorSessionId)
}

async function authorizeAccountChange(
  currentUserId: string,
  session: AccountChangeSession,
  token: string | undefined,
  query: TransactionQuery,
  actorSessionLocked: boolean,
) {
  assertAccountChangeProofFormat(token)
  if (!actorSessionLocked) throw sessionReloginRequired()
  await assertFreshReAuth(currentUserId, session, token, query)
  return captureAccountSecurityAddress(currentUserId, { query })
}

async function applyAccountChange<T>(
  currentUserId: string,
  actorSessionId: string,
  change: (query: TransactionQuery) => Promise<T>,
  query: TransactionQuery,
): Promise<T> {
  const result = await change(query)
  await revokeOtherAuthenticatedSessions(currentUserId, actorSessionId, { query })
  return result
}
