import {
  read,
  withTransactionOptions,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import createHttpError from 'http-errors'
import { providerTableConfigs, type OAuthProvider, type OAuthAccount } from './providers.mts'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import { invalidateVerifiedEmailCache } from '@services/contribution-gating/email-verification'
import onError from '@modules/on-error'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'

type OAuthAccountConnectionPostCommitDependencies = {
  enqueueVoteWeightRecalculation: typeof enqueueRecalculateUserVoteWeight
  invalidateVerifiedEmail: typeof invalidateVerifiedEmailCache
  reportError: typeof onError
}

const defaultPostCommitDependencies: OAuthAccountConnectionPostCommitDependencies = {
  enqueueVoteWeightRecalculation: enqueueRecalculateUserVoteWeight,
  invalidateVerifiedEmail: invalidateVerifiedEmailCache,
  reportError: onError,
}

export async function connectOAuthAccountToUser(
  provider: OAuthProvider,
  userId: string,
  providerUserId: string,
  options: QueryOptions = {},
): Promise<void> {
  const config = providerTableConfigs[provider]
  await withTransactionOptions(options, async query => {
    await assertOAuthAccountConnectionUserActive(query, userId)
    const { rows, rowCount } = await query<{ provider_user_id: string }>(
      `/* connectOAuthAccountToUser */
       WITH connected_account AS (
         UPDATE ${config.table} AS account
         SET user_id = $1
         FROM users
         WHERE account.${config.providerUserIdColumn} = $2
           AND users.id = $1
           AND users.deleted_at IS NULL
           AND (account.user_id IS NULL OR account.user_id = $1)
         RETURNING account.${config.providerUserIdColumn} AS provider_user_id
       ),
       vote_weight_recovery AS (
         UPDATE users
         SET vote_weight_recalculated_at = NULL
         WHERE id = $1
           AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM connected_account)
         RETURNING id
       )
       SELECT connected_account.provider_user_id
       FROM connected_account
       INNER JOIN vote_weight_recovery ON TRUE`,
      [userId, providerUserId],
    )
    if (!rowCount || !rows[0]) {
      const existing = await query(
        `/* connectOAuthAccountToUser */ SELECT ${config.providerUserIdColumn} FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
        [providerUserId],
      )
      if (existing.rows[0]) {
        throw createHttpError(409, `${provider} account already connected to another account`)
      }
      throw createHttpError(404, `${provider} account not found`)
    }
  })
}

export async function assertOAuthAccountConnectionUserActive(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  // Deletion takes this advisory lock before the user row; keep the same lock order.
  await query('/* lockOAuthAccountConnectionUser */ SELECT fn_lock_active_user_for_mutation($1)', [
    userId,
  ])
  await query(
    '/* lockOAuthAccountConnectionUserRow */ SELECT id FROM users WHERE id = $1 FOR UPDATE',
    [userId],
  )
  // A suspension insert's users FK conflicts with FOR UPDATE. Read in a fresh statement after
  // obtaining the row lock so a suspension that committed while we waited is visible.
  const { rows } = await query<{ suspended: boolean }>(
    `/* assertOAuthAccountConnectionUserActive */
     SELECT EXISTS (
       SELECT 1 FROM user_suspensions WHERE user_id = $1 AND lifted_at IS NULL
     ) AS suspended`,
    [userId],
  )
  if (rows[0]?.suspended) {
    throw createCodedError(403, 'Your account has been suspended', ACCOUNT_SUSPENDED)
  }
}

export async function runOAuthAccountConnectionPostCommitEffects(
  userId: string,
  dependencies: OAuthAccountConnectionPostCommitDependencies = defaultPostCommitDependencies,
): Promise<void> {
  try {
    await dependencies.enqueueVoteWeightRecalculation(userId)
  } catch (err) {
    dependencies.reportError(err instanceof Error ? err : new Error(String(err)))
  }
  try {
    await dependencies.invalidateVerifiedEmail(userId)
  } catch (err) {
    dependencies.reportError(err instanceof Error ? err : new Error(String(err)))
  }
}

export async function getOAuthAccountByProviderUserId(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<OAuthAccount | null> {
  const config = providerTableConfigs[provider]
  const { rows } = await read<OAuthAccount>(
    `/* getOAuthAccountByProviderUserId */ SELECT
      user_id,
      ${config.providerUserIdColumn} AS provider_user_id,
      ${config.emailColumn} AS provider_user_email_address,
      ${config.dataColumn} AS provider_user_data
    FROM ${config.table}
    WHERE ${config.providerUserIdColumn} = $1`,
    [providerUserId],
  )
  return rows[0] || null
}
