import { read, beginTransaction, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { invalidateVerifiedEmailCache } from '@services/contribution-gating/email-verification'
import onError from '@modules/on-error'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { hasOtherAuthMethods } from './has-other-auth-methods.mts'

export type EmailAddress = {
  email_address: string
  is_primary: boolean
  created_at: Date
}

async function makeEmailAddressPrimary(
  query: TransactionQuery,
  userId: string,
  normalizedEmail: string,
): Promise<void> {
  await query(
    sql`/* setPrimaryEmailAddress */ UPDATE user_email_addresses SET is_primary = FALSE WHERE user_id = ${userId} AND is_primary = TRUE`,
  )
  await query(
    sql`/* setPrimaryEmailAddress */ UPDATE user_email_addresses SET is_primary = TRUE WHERE user_id = ${userId} AND email_address = ${normalizedEmail}`,
  )
}

export async function listEmailAddressesPage(
  userId: string,
  options: { limit: number; after?: { tier: number; timestamp: string; name: string } },
) {
  const query = sql`/* listEmailAddressesPage */
    SELECT email_address, COALESCE(is_primary, FALSE) AS is_primary, created_at,
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_timestamp
    FROM user_email_addresses
    WHERE user_id = ${userId}
  `
  if (options.after) {
    query.append(sql` AND (
      (is_primary::int) < ${options.after.tier}
      OR ((is_primary::int) = ${options.after.tier}
        AND created_at > ${options.after.timestamp}::timestamptz)
      OR ((is_primary::int) = ${options.after.tier}
        AND created_at = ${options.after.timestamp}::timestamptz
        AND email_address > ${options.after.name})
    )`)
  }
  query.append(
    sql` ORDER BY (is_primary::int) DESC,
      created_at ASC, email_address ASC LIMIT ${options.limit + 1}`,
  )
  const { rows } = await read<EmailAddress & { cursor_timestamp: string }>(query)
  return {
    results: rows.slice(0, options.limit),
    hasNextPage: rows.length > options.limit,
  }
}

export async function getPrimaryEmailAddress(userId: string): Promise<string | null> {
  const { rows } = await read<{ email_address: string }>(
    sql`/* getPrimaryEmailAddress */ SELECT email_address FROM user_email_addresses WHERE user_id = ${userId} ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
  )
  return rows[0]?.email_address ?? null
}

export async function setPrimaryEmailAddress(userId: string, emailAddress: string): Promise<void> {
  const normalized = emailAddress.toLowerCase().trim()

  const exists = await read(
    sql`/* setPrimaryEmailAddress */ SELECT 1 FROM user_email_addresses WHERE user_id = ${userId} AND email_address = ${normalized} LIMIT 1`,
  )
  assert(exists.rows.length > 0, 404, 'Email address not found')

  await using query = await beginTransaction()
  await query(sql`/* setPrimaryEmailAddress */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  await makeEmailAddressPrimary(query, userId, normalized)
  await query.commit()

  void enqueueOnUserUpdated(userId)
}

export async function removeEmailAddress(userId: string, emailAddress: string): Promise<void> {
  const normalized = emailAddress.toLowerCase().trim()

  await using query = await beginTransaction()
  await query(sql`/* removeEmailAddress */ SELECT fn_lock_active_user_for_mutation(${userId})`)

  const { rows: allRows } = await query<{ email_address: string; is_primary: boolean }>(
    sql`/* removeEmailAddress */
      SELECT email_address, is_primary
      FROM user_email_addresses
      WHERE user_id = ${userId}
      FOR UPDATE`,
  )
  const target = allRows.find(row => row.email_address === normalized)
  assert(target, 404, 'Email address not found')

  if (allRows.length === 1) {
    const otherAuth = await hasOtherAuthMethods({ query }, userId, 'email')
    assert(otherAuth, 400, 'Cannot remove your last authentication method')
  } else {
    assert(
      !target.is_primary,
      400,
      'Cannot remove your primary email address. Set another as primary first.',
    )
  }

  await query(
    sql`/* removeEmailAddress */ DELETE FROM user_email_addresses WHERE user_id = ${userId} AND email_address = ${normalized}`,
  )
  await query.commit()

  await invalidateVerifiedEmailCache(userId).catch(onError)
  void enqueueOnUserUpdated(userId)
}
