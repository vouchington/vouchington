import { completeProviderReAuthExchange } from './reauthentication-exchange.mts'
import type { OAuthAccountUpsertOptions } from './reauthentication.mts'
import { registerPostCommitAction } from '@data-stores/psql'
import { runOAuthAccountUpsertTransaction } from './upsert-transaction.mts'
import { encryptSecret } from '@modules/token-secrets'
import createHttpError from 'http-errors'
import onError from '@modules/on-error'
import { invalidateVerifiedEmailCache } from '@services/contribution-gating/email-verification'
import { providerTableConfigs, type OAuthProvider, type OAuthAccount } from './providers.mts'
import { completeOAuthAuthorizationExchange } from './authorization-exchange-completion.mts'
import { resolveEmailDomainHostnameId } from '@services/email-address-validator/email-domain-context'
import { resolveFriendAccountReferences } from './resolve-friend-account-references.mts'

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
  options: OAuthAccountUpsertOptions = {},
): Promise<OAuthAccount> {
  if (!providerUserId) throw createHttpError(401, 'Provider user ID is empty')
  if (options.reAuth)
    return completeProviderReAuthExchange(provider, providerUserId, {
      ...options,
      reAuth: options.reAuth,
    })
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

  return runOAuthAccountUpsertTransaction(options.query, async transactionQuery => {
    // X is not a verified-email source and has no email-domain FK.
    const emailDomainHostnameId =
      provider === 'x'
        ? null
        : await resolveEmailDomainHostnameId(providerUserEmailAddress, { query: transactionQuery })

    let query: string
    let values: unknown[]

    if (hasTokenColumns && hasRefreshToken) {
      const ownsEmailDomain = provider !== 'x'
      const dataParameter = ownsEmailDomain ? 4 : 3
      query = `/* upsertOAuthAccount */
      INSERT INTO ${config.table} (
        ${config.providerUserIdColumn},
        ${config.emailColumn},
        ${ownsEmailDomain ? 'email_domain_hostname_id,' : ''}
        ${config.dataColumn},
        access_token_ciphertext,
        refresh_token_ciphertext,
        access_token_expires_at
      )
      VALUES ($1, $2, ${ownsEmailDomain ? '$3, ' : ''}$${dataParameter}, $${dataParameter + 1}, $${dataParameter + 2}, $${dataParameter + 3})
      ON CONFLICT (${config.providerUserIdColumn})
      DO UPDATE SET
        ${config.emailColumn} = EXCLUDED.${config.emailColumn},
        ${ownsEmailDomain ? 'email_domain_hostname_id = EXCLUDED.email_domain_hostname_id,' : ''}
        ${config.dataColumn} = ${providerDataUpdate},
        access_token_ciphertext = EXCLUDED.access_token_ciphertext,
        refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
        access_token_expires_at = EXCLUDED.access_token_expires_at
      RETURNING
        ${config.accountIdColumn ? `${config.accountIdColumn} AS account_id,` : ''}
        user_id,
        ${config.providerUserIdColumn} AS provider_user_id,
        ${config.emailColumn} AS provider_user_email_address,
        ${config.dataColumn} AS provider_user_data
    `
      values = [
        providerUserId,
        providerUserEmailAddress,
        ...(ownsEmailDomain ? [emailDomainHostnameId] : []),
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
        email_domain_hostname_id,
        ${config.dataColumn},
        access_token_ciphertext,
        access_token_expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (${config.providerUserIdColumn})
      DO UPDATE SET
        ${config.emailColumn} = EXCLUDED.${config.emailColumn},
        email_domain_hostname_id = EXCLUDED.email_domain_hostname_id,
        ${config.dataColumn} = ${providerDataUpdate},
        access_token_ciphertext = EXCLUDED.access_token_ciphertext,
        access_token_expires_at = EXCLUDED.access_token_expires_at
      RETURNING
        ${config.accountIdColumn ? `${config.accountIdColumn} AS account_id,` : ''}
        user_id,
        ${config.providerUserIdColumn} AS provider_user_id,
        ${config.emailColumn} AS provider_user_email_address,
        ${config.dataColumn} AS provider_user_data
    `
      values = [
        providerUserId,
        providerUserEmailAddress,
        emailDomainHostnameId,
        JSON.stringify(providerUserData),
        accessTokenCiphertext,
        tokens?.accessTokenExpiresAt ?? null,
      ]
    } else {
      query = `/* upsertOAuthAccount */
      INSERT INTO ${config.table} (
        ${config.providerUserIdColumn},
        ${config.emailColumn},
        email_domain_hostname_id,
        ${config.dataColumn}
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (${config.providerUserIdColumn})
      DO UPDATE SET
        ${config.emailColumn} = EXCLUDED.${config.emailColumn},
        email_domain_hostname_id = EXCLUDED.email_domain_hostname_id,
        ${config.dataColumn} = ${providerDataUpdate}
      RETURNING
        ${config.accountIdColumn ? `${config.accountIdColumn} AS account_id,` : ''}
        user_id,
        ${config.providerUserIdColumn} AS provider_user_id,
        ${config.emailColumn} AS provider_user_email_address,
        ${config.dataColumn} AS provider_user_data
    `
      values = [
        providerUserId,
        providerUserEmailAddress,
        emailDomainHostnameId,
        JSON.stringify(providerUserData),
      ]
    }

    const { rows } = await transactionQuery<OAuthAccount>(query, values)
    const account = rows[0]
    if (!account) throw createHttpError(500, 'Failed to upsert OAuth account')
    await resolveFriendAccountReferences(provider, account, providerUserId, transactionQuery)
    if (options.authorizationId) {
      if (!options.authorizationClaimId) {
        throw new Error('authorizationClaimId is required with authorizationId')
      }
      await completeOAuthAuthorizationExchange(
        provider,
        options.authorizationId,
        options.authorizationClaimId,
        account.account_id ?? account.provider_user_id,
        transactionQuery,
      )
    }
    if (account.user_id) {
      const userId = account.user_id
      registerPostCommitAction(transactionQuery, async () => {
        await invalidateVerifiedEmailCache(userId).catch(onError)
      })
    }
    return account
  })
}

export function getOAuthTokenPurpose(
  provider: OAuthProvider,
  providerUserId: string,
  column: 'access_token' | 'refresh_token',
): string {
  return `oauth:${provider}:${providerUserId}:${column}`
}
