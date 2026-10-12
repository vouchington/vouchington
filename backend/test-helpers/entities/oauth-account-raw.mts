import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import {
  getOAuthTokenPurpose,
  providerTableConfigs,
  type OAuthProvider,
} from './_oauth-config-support.mts'

type RawOAuthAccountRow = {
  user_id: string | null
  provider_user_email_address: string | null
  provider_user_data: Record<string, unknown>
  access_token: string | null
  refresh_token: string | null
  access_token_expires_at: Date | null
}

/** Read one owned OAuth fixture with decrypted tokens for deletion and replay assertions. */
export async function getTestOAuthAccountRaw(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<RawOAuthAccountRow | null> {
  const config = providerTableConfigs[provider]
  let tokenColumns: string
  if (!config.hasTokenColumns) {
    tokenColumns = `, NULL AS access_token, NULL AS refresh_token, NULL AS access_token_expires_at`
  } else if (config.hasRefreshToken) {
    tokenColumns = `, access_token_ciphertext AS access_token, refresh_token_ciphertext AS refresh_token, access_token_expires_at`
  } else {
    tokenColumns = `, access_token_ciphertext AS access_token, NULL AS refresh_token, access_token_expires_at`
  }
  const { rows } = await read<RawOAuthAccountRow>(
    allowUnannotatedQuery(`SELECT user_id, ${config.emailColumn} AS provider_user_email_address, ${config.dataColumn} AS provider_user_data${tokenColumns}
     FROM ${config.table}
     WHERE ${config.providerUserIdColumn} = $1`),
    [providerUserId],
  )
  const row = rows[0]
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
