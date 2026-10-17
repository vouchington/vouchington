import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { read, write } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import { providerTableConfigs, type OAuthProvider } from './_oauth-config-support.mts'

export async function setOAuthAccountCreatedAt(
  provider: OAuthProvider,
  providerUserId: string,
  createdAt: Date,
): Promise<void> {
  const config = providerTableConfigs[provider]
  // UUIDv7-backed accounts derive created_at from id, so the fixture moves their key instead.
  const column = config.accountIdColumn === 'id' ? 'id' : 'created_at'
  const value = column === 'id' ? uuidv7({ msecs: createdAt.getTime() }) : createdAt
  await write(
    allowUnannotatedQuery(
      `UPDATE ${config.table} SET ${column} = $1 WHERE ${config.providerUserIdColumn} = $2`,
    ),
    [value, providerUserId],
  )
}

export async function getOAuthAccountCreatedAt(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<Date | null> {
  const config = providerTableConfigs[provider]
  const { rows } = await read<{ created_at: Date }>(
    allowUnannotatedQuery(
      `SELECT created_at FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    ),
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
    allowUnannotatedQuery(
      `SELECT ${config.providerUserIdColumn} FROM ${config.table} WHERE ${config.providerUserIdColumn} = $1`,
    ),
    [providerUserId],
  )
  return rows.length > 0
}
