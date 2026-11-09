import { read, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { getOAuthTokenPurpose } from '@services/oauth-accounts/upsert'

export type XSyncAccount = {
  id: string
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
       id,
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
  const { rowCount } = await write(
    `/* updateXTokens */ UPDATE x_accounts
     SET access_token_ciphertext = $1, refresh_token_ciphertext = $2, access_token_expires_at = $3
     WHERE x_user_id = $4 AND user_id = $5
       AND EXISTS (SELECT 1 FROM users WHERE id = $5::uuid AND deleted_at IS NULL)
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
