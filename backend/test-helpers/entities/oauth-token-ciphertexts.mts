import { read } from '@data-stores/psql'
import { providerTableConfigs, type OAuthProvider } from './_oauth-config-support.mts'

export async function getTestOAuthAccountCiphertexts(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<{
  access_token_ciphertext: string | null
  refresh_token_ciphertext: string | null
} | null> {
  const config = providerTableConfigs[provider]
  let tokenColumns: string
  if (!config.hasTokenColumns) {
    tokenColumns = 'NULL AS access_token_ciphertext, NULL AS refresh_token_ciphertext'
  } else if (config.hasRefreshToken) {
    tokenColumns = 'access_token_ciphertext, refresh_token_ciphertext'
  } else {
    tokenColumns = 'access_token_ciphertext, NULL AS refresh_token_ciphertext'
  }
  const { rows } = await read(
    `SELECT ${tokenColumns}
     FROM ${config.table}
     WHERE ${config.providerUserIdColumn} = $1`,
    [providerUserId],
  )
  return (
    (rows[0] as
      | { access_token_ciphertext: string | null; refresh_token_ciphertext: string | null }
      | undefined) ?? null
  )
}
