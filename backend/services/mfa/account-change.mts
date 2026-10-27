import { revokeOtherAuthenticatedSessions } from '@services/jwt-session/user-session-revocation'
import {
  read,
  registerPostCommitAction,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueSendAccountSecurityEmail } from '@queues/emails/enqueues'
import { assertFreshReAuth } from './re-auth.mts'
import { withActiveAccountSession, type AccountChangeSession } from './active-account-session.mts'

/** The actor, recipient, one-use proof and actual change share one durable transaction. */
export async function withReauthenticatedAccountChange<T>(
  currentUserId: string,
  session: AccountChangeSession,
  reAuthToken: string | undefined,
  change: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  return withActiveAccountSession(currentUserId, session, async query => {
    const oldEmail = await authorizeAccountChange(currentUserId, session, reAuthToken, query)
    const result = await applyAccountChange(currentUserId, session.sid, change, query)
    registerPostCommitAction(query, () => notifyAccountSecurityChange(oldEmail))
    return result
  })
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

async function authorizeAccountChange(
  currentUserId: string,
  session: AccountChangeSession,
  token: string | undefined,
  query: TransactionQuery,
) {
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
