import { beginBoundedTransaction, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import createHttpError from 'http-errors'
import onError from '@modules/on-error'
import { invalidateVerifiedEmailCache } from '@services/contribution-gating/email-verification'
import { providerTableConfigs, type OAuthProvider, type OAuthAccount } from './providers.mts'
import { completeOAuthAuthorizationExchange } from './authorization-exchange-completion.mts'

export async function upsertOAuthAccount(
  provider: OAuthProvider,
  providerUserId: string,
  providerUserEmailAddress: string | null,
  providerUserData: Record<string, unknown>,
  tokens?: {
    accessToken?: string
    refreshToken?: string
    accessTokenExpiresAt?: Date
  },
  options: {
    authorizationId?: string
    authorizationClaimId?: string
  } = {},
): Promise<OAuthAccount> {
  if (!providerUserId) throw createHttpError(401, 'Provider user ID is empty')
  const config = providerTableConfigs[provider]
  const { hasTokenColumns, hasRefreshToken } = config
  const providerDataUpdate =
    config.dataConflictStrategy === 'merge'
      ? `${config.table}.${config.dataColumn} || EXCLUDED.${config.dataColumn}`
      : `EXCLUDED.${config.dataColumn}`
  const accessTokenCiphertext = tokens?.accessToken
    ? encryptSecret(
        tokens.accessToken,
        getOAuthTokenPurpose(provider, providerUserId, 'access_token'),
      )
    : null
  const refreshTokenCiphertext = tokens?.refreshToken
    ? encryptSecret(
        tokens.refreshToken,
        getOAuthTokenPurpose(provider, providerUserId, 'refresh_token'),
      )
    : null

  let query: string
  let values: unknown[]

  if (hasTokenColumns && hasRefreshToken) {
    query = `/* upsertOAuthAccount */
      INSERT INTO ${config.table} (
        ${config.providerUserIdColumn},
        ${config.emailColumn},
        ${config.dataColumn},
        access_token_ciphertext,
        refresh_token_ciphertext,
        access_token_expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (${config.providerUserIdColumn})
      DO UPDATE SET
        ${config.emailColumn} = EXCLUDED.${config.emailColumn},
        ${config.dataColumn} = ${providerDataUpdate},
        access_token_ciphertext = EXCLUDED.access_token_ciphertext,
        refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
        access_token_expires_at = EXCLUDED.access_token_expires_at
      RETURNING
        user_id,
        ${config.providerUserIdColumn} AS provider_user_id,
        ${config.emailColumn} AS provider_user_email_address,
        ${config.dataColumn} AS provider_user_data
    `
    values = [
      providerUserId,
      providerUserEmailAddress,
      JSON.stringify(providerUserData),
      accessTokenCiphertext,
      refreshTokenCiphertext,
      tokens?.accessTokenExpiresAt ?? null,
    ]
  } else if (hasTokenColumns) {
    query = `/* upsertOAuthAccount */
      INSERT INTO ${config.table} (
        ${config.providerUserIdColumn},
        ${config.emailColumn},
        ${config.dataColumn},
        access_token_ciphertext,
        access_token_expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (${config.providerUserIdColumn})
      DO UPDATE SET
        ${config.emailColumn} = EXCLUDED.${config.emailColumn},
        ${config.dataColumn} = ${providerDataUpdate},
        access_token_ciphertext = EXCLUDED.access_token_ciphertext,
        access_token_expires_at = EXCLUDED.access_token_expires_at
      RETURNING
        user_id,
        ${config.providerUserIdColumn} AS provider_user_id,
        ${config.emailColumn} AS provider_user_email_address,
        ${config.dataColumn} AS provider_user_data
    `
    values = [
      providerUserId,
      providerUserEmailAddress,
      JSON.stringify(providerUserData),
      accessTokenCiphertext,
      tokens?.accessTokenExpiresAt ?? null,
    ]
  } else {
    query = `/* upsertOAuthAccount */
      INSERT INTO ${config.table} (
        ${config.providerUserIdColumn},
        ${config.emailColumn},
        ${config.dataColumn}
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (${config.providerUserIdColumn})
      DO UPDATE SET
        ${config.emailColumn} = EXCLUDED.${config.emailColumn},
        ${config.dataColumn} = ${providerDataUpdate}
      RETURNING
        user_id,
        ${config.providerUserIdColumn} AS provider_user_id,
        ${config.emailColumn} AS provider_user_email_address,
        ${config.dataColumn} AS provider_user_data
    `
    values = [providerUserId, providerUserEmailAddress, JSON.stringify(providerUserData)]
  }

  const persistence = options.authorizationId
    ? persistAuthorizedOAuthAccount()
    : write(query, values)
  const { rows } = await persistence
  if (!rows[0]) throw createHttpError(500, 'Failed to upsert OAuth account')
  if (rows[0].user_id) await invalidateVerifiedEmailCache(rows[0].user_id).catch(onError)
  return rows[0]

  async function persistAuthorizedOAuthAccount() {
    await using transactionQuery = await beginBoundedTransaction({
      connectionTimeoutMs: 10_000,
      statementTimeoutMs: 2_000,
    })
    const result = await transactionQuery(query, values)
    const account = result.rows[0] as OAuthAccount | undefined
    if (!account) throw createHttpError(500, 'Failed to upsert OAuth account')
    if (!options.authorizationId || !options.authorizationClaimId) {
      throw new Error('authorizationClaimId is required with authorizationId')
    }
    await completeOAuthAuthorizationExchange(
      provider,
      options.authorizationId,
      options.authorizationClaimId,
      account.provider_user_id,
      transactionQuery,
    )
    await transactionQuery.commit()
    return result
  }
}

export function getOAuthTokenPurpose(
  provider: OAuthProvider,
  providerUserId: string,
  column: 'access_token' | 'refresh_token',
): string {
  return `oauth:${provider}:${providerUserId}:${column}`
}
