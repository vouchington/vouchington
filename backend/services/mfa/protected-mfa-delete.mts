import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { MFA_REAUTH_REQUIRED } from '@modules/on-error/error-codes'
import { getUserMfaStatus } from './status.mts'
import { verifyAndDeleteReAuthToken } from './re-auth.mts'
import { deletePasskey } from '@services/passkeys'
import { deleteTotpAuthenticator } from '@services/totp'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'

async function lockUserMfaRows(query: TransactionQuery, userId: string): Promise<void> {
  await query(
    sql`/* withMfaLock */ SELECT 1 FROM user_passkeys WHERE user_id = ${userId} FOR UPDATE`,
  )
  await query(
    sql`/* withMfaLock */ SELECT 1 FROM user_totp_authenticators WHERE user_id = ${userId} FOR UPDATE`,
  )
}

async function lockMfaMutation(query: TransactionQuery, userId: string): Promise<void> {
  await query(sql`/* withMfaLock */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  await lockUserMfaRows(query, userId)
}

// Lock all MFA rows for the user inside a transaction to prevent TOCTOU races
// where two concurrent deletes both pass the last-method check and both succeed.
async function withMfaLock<T>(
  userId: string,
  handler: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  await lockMfaMutation(query, userId)
  const result = await handler(query)
  await query.commit()
  return result
}

async function assertReAuthIfLastMethod(
  userId: string,
  query: TransactionQuery,
  reAuthToken: string | undefined,
): Promise<void> {
  const status = await getUserMfaStatus(userId, { query })
  if (status.passkeysCount + status.totpCount > 1) return

  if (!reAuthToken)
    throw createCodedError(
      422,
      'Re-authentication required to remove last MFA method',
      MFA_REAUTH_REQUIRED,
    )

  const valid = await verifyAndDeleteReAuthToken(userId, reAuthToken)
  assert(valid, 401, 'Re-authentication token expired or invalid')
}

export async function deletePasskeyWithMfaProtection(
  userId: string,
  passkeyId: string,
  reAuthToken: string | undefined,
): Promise<void> {
  await withMfaLock(userId, async query => {
    await assertReAuthIfLastMethod(userId, query, reAuthToken)
    await deletePasskey(userId, passkeyId, { query })
  })
  // Enqueue after the transaction commits so the job sees the committed delete.
  void enqueueRecalculateUserVoteWeight(userId)
}

export async function deleteTotpAuthenticatorWithMfaProtection(
  userId: string,
  authenticatorId: string,
  reAuthToken: string | undefined,
): Promise<void> {
  await withMfaLock(userId, async query => {
    await assertReAuthIfLastMethod(userId, query, reAuthToken)
    await deleteTotpAuthenticator(userId, authenticatorId, { query })
  })
}
