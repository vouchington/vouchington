import { beginTransaction, read, write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import { encryptSecret } from '@modules/token-secrets'
import { getOAuthTokenPurpose } from '@services/oauth-accounts/upsert'

export type XSyncAccount = {
  userId: string | null
  accessTokenCiphertext: string
  refreshTokenCiphertext: string | null
  accessTokenExpiresAt: Date | null
  accessTokenExpiresAtText: string | null
}

export type XCredentialGeneration = {
  accessTokenCiphertext: string
  refreshTokenCiphertext: string | null
  accessTokenExpiresAt: string | null
}

export async function getXSyncAccount(xUserId: string): Promise<XSyncAccount | undefined> {
  const { rows } = await read<XSyncAccount>(
    `/* getXSyncAccount */ SELECT
       user_id AS "userId",
       access_token_ciphertext AS "accessTokenCiphertext",
       refresh_token_ciphertext AS "refreshTokenCiphertext",
       access_token_expires_at AS "accessTokenExpiresAt",
       access_token_expires_at::text AS "accessTokenExpiresAtText"
     FROM x_accounts
     WHERE x_user_id = $1 AND access_token_ciphertext IS NOT NULL`,
    [xUserId],
  )
  return rows[0]
}

export async function persistXRefreshedTokens(
  xUserId: string,
  userId: string,
  generation: XCredentialGeneration,
  refreshedTokens: { accessToken: string; refreshToken: string | null; expiresAt: Date | null },
): Promise<boolean> {
  await using query = await beginTransaction()
  await query(`/* persistXRefreshedTokens */ SELECT fn_lock_active_user_for_mutation($1::uuid)`, [
    userId,
  ])
  const owner = await query(
    `/* persistXRefreshedTokens */ SELECT 1 FROM x_accounts WHERE x_user_id = $1 AND user_id = $2 FOR UPDATE`,
    [xUserId, userId],
  )
  if (owner.rows.length === 0) return false

  const persisted = await updateXTokens(xUserId, userId, generation, refreshedTokens, query)
  await query.commit()
  return persisted
}

async function updateXTokens(
  xUserId: string,
  userId: string,
  generation: XCredentialGeneration,
  refreshedTokens: { accessToken: string; refreshToken: string | null; expiresAt: Date | null },
  query: QueryExecutor = write,
): Promise<boolean> {
  const { rowCount } = await query(
    `/* updateXTokens */ UPDATE x_accounts
     SET access_token_ciphertext = $1, refresh_token_ciphertext = $2, access_token_expires_at = $3
     WHERE x_user_id = $4 AND user_id = $5
       AND access_token_ciphertext IS NOT DISTINCT FROM $6::text
       AND refresh_token_ciphertext IS NOT DISTINCT FROM $7::text
       AND access_token_expires_at::text IS NOT DISTINCT FROM $8::text`,
    [
      encryptSecret(
        refreshedTokens.accessToken,
        getOAuthTokenPurpose('x', xUserId, 'access_token'),
      ),
      refreshedTokens.refreshToken
        ? encryptSecret(
            refreshedTokens.refreshToken,
            getOAuthTokenPurpose('x', xUserId, 'refresh_token'),
          )
        : null,
      refreshedTokens.expiresAt,
      xUserId,
      userId,
      generation.accessTokenCiphertext,
      generation.refreshTokenCiphertext,
      generation.accessTokenExpiresAt,
    ],
  )
  return (rowCount ?? 0) > 0
}

export async function getXFriendSyncStartTime(): Promise<string> {
  const {
    rows: [{ now }],
  } = await read(`/* getXFriendSyncStartTime */ SELECT CURRENT_TIMESTAMP::text AS now`, [])
  return now as string
}
