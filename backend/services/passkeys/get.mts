import { USER_PASSKEYS_MAX } from '@services/user-product-limits'
import { read, type QueryOptions, type TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type { StoredPasskey } from '@vouchington/auth'
import type { PublicPasskey } from './types.mts'

export type PasskeyCredential = StoredPasskey

type PasskeyCredentialRow = Omit<PasskeyCredential, 'counter' | 'transports'> & {
  counter: number | string
  transports: PasskeyCredential['transports'] | null
}

type PasskeyOwner = { currentUserId: string; passkeyId: string }

export async function getPasskeysByUserId(
  userId: string,
  options: { limit?: number; after?: { id: string } } = {},
): Promise<{ results: PublicPasskey[]; hasNextPage: boolean }> {
  const limit = Math.min(options.limit ?? USER_PASSKEYS_MAX, USER_PASSKEYS_MAX)
  const query = sql`/* getPasskeysByUserId */
    SELECT id, name, device_type, is_backed_up, created_at, last_used_at
    FROM user_passkeys
    WHERE user_id = ${userId}
  `
  if (options.after) {
    query.append(sql` AND id > ${options.after.id}`)
  }
  query.append(sql` ORDER BY id ASC LIMIT ${Math.min(limit + 1, USER_PASSKEYS_MAX)}`)
  const { rows } = await read(query)

  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit) as PublicPasskey[]
  return { results, hasNextPage }
}

export async function getPasskeyCredentialIdsByUserId(
  userId: string,
  options?: QueryOptions & { passkeyId?: string },
): Promise<string[]> {
  const statement = sql`/* getPasskeyCredentialIdsByUserId */ SELECT credential_id FROM user_passkeys WHERE user_id = ${userId}`
  if (options?.passkeyId !== undefined) statement.append(sql` AND id = ${options.passkeyId}`)
  statement.append(sql` LIMIT ${USER_PASSKEYS_MAX}`)
  const { rows } = await read(statement, options)
  if (options?.passkeyId !== undefined && rows.length !== 1)
    throw createHttpError(404, 'Passkey not found')
  return rows.map(row => row.credential_id as string)
}

export async function getPasskeyByCredentialId(
  credentialId: string,
  options?: { query?: TransactionQuery; owner?: PasskeyOwner },
): Promise<PasskeyCredential | null> {
  const statement = passkeyCredentialStatement(credentialId, options?.owner)
  const { rows } = await read(statement, { query: options?.query })
  return passkeyCredentialFromRow(rows[0] as PasskeyCredentialRow | undefined)
}

/** Keep owner-scoped credential verification on the caller's actor transaction. */
export async function getPasskeyByCredentialIdForUpdate(
  query: TransactionQuery,
  credentialId: string,
  owner: PasskeyOwner,
): Promise<PasskeyCredential | null> {
  const statement = passkeyCredentialStatement(credentialId, owner)
  statement.append(sql` FOR UPDATE`)
  const { rows } = await query(statement)
  return passkeyCredentialFromRow(rows[0] as PasskeyCredentialRow | undefined)
}

function passkeyCredentialStatement(credentialId: string, owner?: PasskeyOwner) {
  const statement = sql`/* getPasskeyByCredentialId */ SELECT id,
          user_id AS "userId",
          credential_id AS "credentialId",
          public_key AS "publicKey",
          counter,
          transports
        FROM user_passkeys
        WHERE credential_id = ${credentialId}`
  if (owner)
    statement.append(sql` AND user_id = ${owner.currentUserId} AND id = ${owner.passkeyId}`)
  return statement
}

function passkeyCredentialFromRow(row: PasskeyCredentialRow | undefined): PasskeyCredential | null {
  return row
    ? { ...row, counter: Number(row.counter), transports: row.transports ?? undefined }
    : null
}
