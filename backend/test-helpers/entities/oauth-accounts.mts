import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { upsertTestEmailDomainHostnameId } from './email-domain-hostname.mts'
import {
  getOAuthTokenPurpose,
  providerTableConfigs,
  type OAuthProvider,
  type OAuthAccount,
} from './_oauth-config-support.mts'

export async function insertTestOAuthAccount(
  provider: OAuthProvider,
  providerUserId: string,
  providerUserEmailAddress: string | null = null,
): Promise<OAuthAccount> {
  const config = providerTableConfigs[provider]
  const emailDomainHostnameId =
    provider !== 'x' && providerUserEmailAddress
      ? await upsertTestEmailDomainHostnameId(providerUserEmailAddress)
      : null
  const emailDomainColumn = provider === 'x' ? '' : 'email_domain_hostname_id,'
  const emailDomainValue = provider === 'x' ? '' : '$3,'
  const query = `
    INSERT INTO ${config.table} (
      ${config.providerUserIdColumn},
      ${config.emailColumn},
      ${emailDomainColumn}
      ${config.dataColumn}
    )
    VALUES ($1, $2, ${emailDomainValue} '{}')
    RETURNING
      user_id,
      ${config.providerUserIdColumn} AS provider_user_id,
      ${config.accountIdColumn ? `${config.accountIdColumn} AS account_id,` : ''}
      ${config.emailColumn} AS provider_user_email_address,
      ${config.dataColumn} AS provider_user_data
  `
  const values =
    provider === 'x'
      ? [providerUserId, providerUserEmailAddress]
      : [providerUserId, providerUserEmailAddress, emailDomainHostnameId]
  const { rows } = await write<OAuthAccount>(allowUnannotatedQuery(query), values)
  return rows[0]
}

export async function connectTestOAuthAccount(
  provider: OAuthProvider,
  userId: string,
  providerUserId: string,
): Promise<void> {
  const config = providerTableConfigs[provider]
  const { rowCount } = await write(
    allowUnannotatedQuery(
      `UPDATE ${config.table} SET user_id = $1 WHERE ${config.providerUserIdColumn} = $2`,
    ),
    [userId, providerUserId],
  )
  if (!rowCount) {
    throw new Error(`connectTestOAuthAccount: no ${provider} account found for ${providerUserId}`)
  }
}

export async function setTestOAuthAccountData(
  provider: OAuthProvider,
  providerUserId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const config = providerTableConfigs[provider]
  const { rowCount } = await write(
    allowUnannotatedQuery(
      `UPDATE ${config.table} SET ${config.dataColumn} = $1 WHERE ${config.providerUserIdColumn} = $2`,
    ),
    [JSON.stringify(data), providerUserId],
  )
  if (!rowCount) {
    throw new Error(`setTestOAuthAccountData: no ${provider} account found for ${providerUserId}`)
  }
}

export async function setTestOAuthAccountTokens(
  provider: OAuthProvider,
  providerUserId: string,
  tokens: { accessToken?: string | null; refreshToken?: string | null },
): Promise<void> {
  const config = providerTableConfigs[provider]
  const sets: string[] = []
  const values: unknown[] = []
  let paramIndex = 1
  if (tokens.accessToken !== undefined) {
    sets.push(`access_token_ciphertext = $${paramIndex++}`)
    values.push(
      tokens.accessToken
        ? encryptSecret(
            tokens.accessToken,
            getOAuthTokenPurpose(provider, providerUserId, 'access_token'),
          )
        : null,
    )
  }
  if (tokens.refreshToken !== undefined) {
    sets.push(`refresh_token_ciphertext = $${paramIndex++}`)
    values.push(
      tokens.refreshToken
        ? encryptSecret(
            tokens.refreshToken,
            getOAuthTokenPurpose(provider, providerUserId, 'refresh_token'),
          )
        : null,
    )
  }
  if (sets.length === 0) return
  values.push(providerUserId)
  await write(
    allowUnannotatedQuery(
      `UPDATE ${config.table} SET ${sets.join(', ')} WHERE ${config.providerUserIdColumn} = $${paramIndex}`,
    ),
    values,
  )
}

export async function setTestOAuthAccountFriendsSyncedAt(
  provider: OAuthProvider,
  providerUserId: string,
  syncedAt: 'now' | 'expired' | null,
): Promise<void> {
  const config = providerTableConfigs[provider]
  const value =
    syncedAt === 'now' ? 'NOW()' : syncedAt === 'expired' ? "NOW() - INTERVAL '1 hour'" : 'NULL'
  await write(
    allowUnannotatedQuery(
      `UPDATE ${config.table} SET friends_synced_at = ${value} WHERE ${config.providerUserIdColumn} = $1`,
    ),
    [providerUserId],
  )
}

export async function setTestOAuthAccountTokenExpiry(
  provider: OAuthProvider,
  providerUserId: string,
  expired: boolean,
): Promise<void> {
  const config = providerTableConfigs[provider]
  const value = expired ? "NOW() - INTERVAL '1 hour'" : "NOW() + INTERVAL '1 hour'"
  await write(
    allowUnannotatedQuery(
      `UPDATE ${config.table} SET access_token_expires_at = ${value} WHERE ${config.providerUserIdColumn} = $1`,
    ),
    [providerUserId],
  )
}

export async function deleteTestOAuthAccount(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<void> {
  const config = providerTableConfigs[provider]
  await write(
    allowUnannotatedQuery(`DELETE FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`),
    [providerUserId],
  )
}

export { getTestOAuthAccountRaw } from './oauth-account-raw.mts'
