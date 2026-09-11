import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { StoredPasskey } from '@vouchington/auth'
import type { PublicPasskey } from './types.mts'

export type PasskeyCredential = StoredPasskey<string, string>

type PasskeyCredentialRow = Omit<PasskeyCredential, 'counter' | 'transports'> & {
  counter: number | string
  transports: PasskeyCredential['transports'] | null
}

export async function getPasskeysByUserId(
  userId: string,
  options: { limit?: number; after?: { id: string } } = {},
): Promise<{ results: PublicPasskey[]; hasNextPage: boolean }> {
  const limit = options.limit ?? 25
  const query = sql`/* getPasskeysByUserId */
    SELECT id, name, device_type, backed_up, created_at, last_used_at
    FROM user_passkeys
    WHERE user_id = ${userId}
  `
  if (options.after) {
    query.append(sql` AND id > ${options.after.id}`)
  }
  query.append(sql` ORDER BY id ASC LIMIT ${limit + 1}`)
  const { rows } = await read(query)

  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit) as PublicPasskey[]
  return { results, hasNextPage }
}

export async function getPasskeyCredentialIdsByUserId(userId: string): Promise<string[]> {
  const { rows } = await read(
    sql`/* getPasskeyCredentialIdsByUserId */ SELECT credential_id FROM user_passkeys WHERE user_id = ${userId}`,
  )
  return rows.map(row => row.credential_id as string)
}

export async function getPasskeyByCredentialId(
  credentialId: string,
): Promise<PasskeyCredential | null> {
  const { rows } = await read(
    sql`/* getPasskeyByCredentialId */ SELECT id,
          user_id AS "userId",
          credential_id AS "credentialId",
          public_key AS "publicKey",
          counter,
          transports
        FROM user_passkeys
        WHERE credential_id = ${credentialId}`,
  )
  const row = rows[0] as PasskeyCredentialRow | undefined
  return row
    ? { ...row, counter: Number(row.counter), transports: row.transports ?? undefined }
    : null
}
