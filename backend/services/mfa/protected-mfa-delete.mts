import type { AccountChangeSession } from './active-account-session.mts'
import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getUserMfaStatus } from './status.mts'
import { withReauthenticatedAccountChange } from './account-change.mts'
import { deletePasskey } from '@services/passkeys'
import { deleteTotpAuthenticator } from '@services/totp'
import { enqueueRecalculateUserVoteWeightBestEffort } from '@queues/vote-aggregation/enqueues/vote-weight'

async function assertAdministratorKeepsMfa(
  userId: string,
  query: TransactionQuery,
  pendingTotpId?: string,
): Promise<void> {
  if (pendingTotpId) {
    const { rows } =
      await query(sql`/* deletingVerifiedTotp */ SELECT 1 FROM user_totp_authenticators
      WHERE id = ${pendingTotpId} AND user_id = ${userId} AND verified_at IS NOT NULL LIMIT 1`)
    if (rows.length === 0) return
  }
  const status = await getUserMfaStatus(userId, { query })
  if (status.passkeysCount + status.totpCount > 1) return
  const { rows } = await query(sql`/* administratorMfaRequired */
    SELECT 1 FROM user_roles r JOIN user_role_types t ON t.id = r.role_type_id
    WHERE r.user_id = ${userId} AND t.slug = 'administrator' LIMIT 1
  `)
  assert(rows.length === 0, 403, 'Administrators must keep an MFA method')
}

export async function deletePasskeyWithMfaProtection(
  userId: string,
  passkeyId: string,
  reAuthToken: string | undefined,
  session: AccountChangeSession,
): Promise<void> {
  await withReauthenticatedAccountChange(userId, session, reAuthToken, async query => {
    await assertAdministratorKeepsMfa(userId, query)
    await deletePasskey(userId, passkeyId, query)
  })
  // Enqueue after the transaction commits so the job sees the committed delete.
  await enqueueRecalculateUserVoteWeightBestEffort(userId)
}

export async function deleteTotpAuthenticatorWithMfaProtection(
  userId: string,
  authenticatorId: string,
  reAuthToken: string | undefined,
  session: AccountChangeSession,
): Promise<void> {
  await withReauthenticatedAccountChange(userId, session, reAuthToken, async query => {
    await assertAdministratorKeepsMfa(userId, query, authenticatorId)
    await deleteTotpAuthenticator(userId, authenticatorId, query)
  })
}
