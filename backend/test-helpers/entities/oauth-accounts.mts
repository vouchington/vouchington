import { write, read } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
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
  const query = `
    INSERT INTO ${config.table} (
      ${config.providerUserIdColumn},
      ${config.emailColumn},
      ${config.dataColumn}
    )
    VALUES ($1, $2, '{}')
    RETURNING
      user_id,
      ${config.providerUserIdColumn} AS provider_user_id,
      ${config.emailColumn} AS provider_user_email_address,
      ${config.dataColumn} AS provider_user_data
  `
  const { rows } = await write(query, [providerUserId, providerUserEmailAddress])
  return rows[0]
}

export async function connectTestOAuthAccount(
  provider: OAuthProvider,
  userId: string,
  providerUserId: string,
): Promise<void> {
  const config = providerTableConfigs[provider]
  const { rowCount } = await write(
    `UPDATE ${config.table} SET user_id = $1 WHERE ${config.providerUserIdColumn} = $2`,
    [userId, providerUserId],
  )
  if (!rowCount) {
    throw new Error(`connectTestOAuthAccount: no ${provider} account found for ${providerUserId}`)
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
    `UPDATE ${config.table} SET ${sets.join(', ')} WHERE ${config.providerUserIdColumn} = $${paramIndex}`,
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
    `UPDATE ${config.table} SET friends_synced_at = ${value} WHERE ${config.providerUserIdColumn} = $1`,
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
    `UPDATE ${config.table} SET access_token_expires_at = ${value} WHERE ${config.providerUserIdColumn} = $1`,
    [providerUserId],
  )
}

export async function deleteTestOAuthAccount(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<void> {
  const config = providerTableConfigs[provider]
  await write(`DELETE FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`, [
    providerUserId,
  ])
}

export async function getTestOAuthAccountRaw(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<{
  user_id: string | null
  provider_user_email_address: string | null
  provider_user_data: Record<string, unknown>
  access_token: string | null
  refresh_token: string | null
  access_token_expires_at: Date | null
} | null> {
  const config = providerTableConfigs[provider]
  let tokenColumns: string
  if (!config.hasTokenColumns) {
    tokenColumns = `, NULL AS access_token, NULL AS refresh_token, NULL AS access_token_expires_at`
  } else if (config.hasRefreshToken) {
    tokenColumns = `, access_token_ciphertext AS access_token, refresh_token_ciphertext AS refresh_token, access_token_expires_at`
  } else {
    tokenColumns = `, access_token_ciphertext AS access_token, NULL AS refresh_token, access_token_expires_at`
  }
  const { rows } = await read(
    `SELECT user_id, ${config.emailColumn} AS provider_user_email_address, ${config.dataColumn} AS provider_user_data${tokenColumns}
     FROM ${config.table}
     WHERE ${config.providerUserIdColumn} = $1`,
    [providerUserId],
  )
  const row = rows[0] as
    | ((typeof rows)[0] & {
        access_token?: string | null
        refresh_token?: string | null
      })
    | undefined
  if (!row) return null
  if (row.access_token) {
    row.access_token = decryptSecret(
      row.access_token,
      getOAuthTokenPurpose(provider, providerUserId, 'access_token'),
    )
  }
  if (row.refresh_token) {
    row.refresh_token = decryptSecret(
      row.refresh_token,
      getOAuthTokenPurpose(provider, providerUserId, 'refresh_token'),
    )
  }
  return row
}
