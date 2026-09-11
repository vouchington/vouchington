import { read, write } from '@data-stores/psql'
import { providerTableConfigs, type OAuthProvider } from './_oauth-config-support.mts'

export async function setOAuthAccountCreatedAt(
  provider: OAuthProvider,
  providerUserId: string,
  createdAt: Date,
): Promise<void> {
  const config = providerTableConfigs[provider]
  await write(
    `UPDATE ${config.table} SET created_at = $1 WHERE ${config.providerUserIdColumn} = $2`,
    [createdAt, providerUserId],
  )
}

export async function getOAuthAccountCreatedAt(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<Date | null> {
  const config = providerTableConfigs[provider]
  const { rows } = await read<{ created_at: Date }>(
    `SELECT created_at FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    [providerUserId],
  )
  return rows[0]?.created_at ?? null
}

export async function oauthAccountExistsByProviderUserId(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<boolean> {
  const config = providerTableConfigs[provider]
  const { rows } = await read(
    `SELECT ${config.providerUserIdColumn} FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    [providerUserId],
  )
  return rows.length > 0
}
