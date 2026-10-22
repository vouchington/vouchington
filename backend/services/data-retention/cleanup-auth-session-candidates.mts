import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import type { CleanupName } from './cleanup-auth-sessions.mts'

export type Candidate = { id: string; user_id?: string; position_at: string | null }
export type Cursor = {
  cursor_at: string | null
  cursor_id: string | null
  cursor_user_id: string | null
  sweep_cutoff_at: Date | null
}

export async function listCandidates(
  query: TransactionQuery,
  name: CleanupName,
  cutoff: Date,
  limit: number,
  cursor?: Cursor,
  lowerBoundDate?: Date,
): Promise<Candidate[]> {
  const isToken = name === 'email_address_login_tokens' || name === 'phone_number_login_tokens'
  const timestampColumn = name === 'user_sessions' ? 'expires_at' : 'deleted_at'
  const alias = name === 'web_push_subscriptions' ? 'subscription' : 'source'
  const parameters: unknown[] = [isToken ? getMinUUIDv7ForDate(cutoff) : cutoff]
  let predicate = isToken
    ? `${alias}.id < $1::uuid`
    : `${alias}.${timestampColumn} < $1::timestamptz`
  if (name === 'web_push_subscriptions') predicate += ` AND ${alias}.deleted_at IS NOT NULL`
  if (lowerBoundDate) {
    parameters.push(isToken ? getMinUUIDv7ForDate(lowerBoundDate) : lowerBoundDate)
    predicate += isToken
      ? ` AND ${alias}.id >= $${parameters.length}::uuid`
      : ` AND ${alias}.${timestampColumn} >= $${parameters.length}::timestamptz`
  }
  if (cursor?.cursor_id) {
    if (isToken) {
      parameters.push(cursor.cursor_id)
      predicate += ` AND ${alias}.id > $${parameters.length}::uuid`
    } else if (name === 'web_push_subscriptions') {
      parameters.push(cursor.cursor_at, cursor.cursor_id, cursor.cursor_user_id)
      predicate += ` AND (${alias}.${timestampColumn}, ${alias}.id, ${alias}.user_id) > ($${parameters.length - 2}::timestamptz, $${parameters.length - 1}::uuid, $${parameters.length}::uuid)`
    } else {
      parameters.push(cursor.cursor_at, cursor.cursor_id)
      predicate += ` AND (${alias}.${timestampColumn}, ${alias}.id) > ($${parameters.length - 1}::timestamptz, $${parameters.length}::uuid)`
    }
  }
  parameters.push(limit)
  const columns = name === 'web_push_subscriptions' ? `${alias}.user_id, ` : ''
  // PostgreSQL timestamps have microsecond precision; node-postgres Date parsing loses three digits.
  const position = isToken ? 'NULL::text' : `${alias}.${timestampColumn}::text`
  const order =
    name === 'web_push_subscriptions'
      ? `${alias}.${timestampColumn}, ${alias}.id, ${alias}.user_id`
      : isToken
        ? `${alias}.id`
        : `${alias}.${timestampColumn}, ${alias}.id`
  const { rows } = await query<Candidate>(
    `/* listAuthSessionRetentionCandidates */
     SELECT ${columns}${alias}.id, ${position} AS position_at
     FROM ${name} ${alias}
     WHERE ${predicate}
     ORDER BY ${order}
     LIMIT $${parameters.length}
     FOR UPDATE OF ${alias} SKIP LOCKED`,
    parameters,
  )
  return rows
}
