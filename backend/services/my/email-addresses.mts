/* eslint-disable max-lines */
import { read, beginTransaction, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { validateEmailAddress } from '@services/email-address-validator'
import { createLoginToken } from '@services/users/login-token'
import {
  invalidateVerifiedEmailCache,
  primeVerifiedEmailCache,
} from '@services/contribution-gating/email-verification'
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

async function assertEmailAddressAvailableForUser(
  userId: string,
  normalizedEmail: string,
): Promise<void> {
  const existing = await read(
    sql`/* assertEmailAddressAvailableForUser */ SELECT user_id FROM user_email_addresses WHERE email_address = ${normalizedEmail} LIMIT 1`,
  )
  assert(
    existing.rows.length === 0 || existing.rows[0].user_id === userId,
    422,
    'Email address is already in use',
  )

  const alreadyAdded = await read(
    sql`/* assertEmailAddressAvailableForUser */ SELECT 1 FROM user_email_addresses WHERE user_id = ${userId} AND email_address = ${normalizedEmail} LIMIT 1`,
  )
  assert(alreadyAdded.rows.length === 0, 422, 'Email address already added to your account')
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

export async function createEmailVerificationToken(
  userId: string,
  emailAddress: string,
): Promise<{ token: string; normalizedEmail: string }> {
  const validated = await validateEmailAddress(emailAddress)
  const normalized = validated.toLowerCase()
  await assertEmailAddressAvailableForUser(userId, normalized)

  const token = createLoginToken()

  await using query = await beginTransaction()
  await query(
    sql`/* createEmailVerificationToken */ SELECT fn_lock_active_user_for_mutation(${userId})`,
  )
  await query(sql`/* createEmailVerificationToken */
      INSERT INTO email_address_login_tokens (email_address, token, user_id)
      VALUES (${normalized}, ${token}, ${userId})
      ON CONFLICT (user_id, email_address) WHERE user_id IS NOT NULL
      DO UPDATE SET
        token = ${token},
        logged_in_at = NULL,
        updated_at = NOW()
    `)
  await query.commit()

  return { token, normalizedEmail: normalized }
}

export async function verifyEmailVerificationToken(
  userId: string,
  emailAddress: string,
  token: string,
): Promise<void> {
  const normalized = emailAddress.toLowerCase().trim()
  const normalizedToken = token.toUpperCase().trim()

  await invalidateVerifiedEmailCache(userId).catch(onError)

  await verifyTokenAndPrimeEmailCache(userId, normalized, normalizedToken)

  void enqueueOnUserUpdated(userId)
}

async function verifyTokenAndPrimeEmailCache(
  userId: string,
  normalizedEmailAddress: string,
  normalizedToken: string,
): Promise<void> {
  await using query = await beginTransaction()
  await query(
    sql`/* verifyEmailVerificationToken */ SELECT fn_lock_active_user_for_mutation(${userId})`,
  )
  const { rowCount } = await query(sql`/* verifyEmailVerificationToken */
      DELETE FROM email_address_login_tokens
      WHERE user_id = ${userId}
        AND email_address = ${normalizedEmailAddress}
        AND token = ${normalizedToken}
        AND logged_in_at IS NULL
        AND created_at > NOW() - INTERVAL '30 minutes'
    `)
  assert(rowCount === 1, 400, 'Invalid or expired verification code')

  const { rows: claimed } = await query(
    sql`/* verifyEmailVerificationToken */ SELECT user_id FROM user_email_addresses WHERE email_address = ${normalizedEmailAddress} LIMIT 1`,
  )
  assert(
    claimed.length === 0 || claimed[0].user_id === userId,
    422,
    'Email address has already been claimed by another account',
  )

  const { rows: countRows } = await query(
    sql`/* verifyEmailVerificationToken */ SELECT COUNT(*) AS count FROM user_email_addresses WHERE user_id = ${userId}`,
  )
  const isPrimary = Number(countRows[0].count) === 0

  await query(sql`/* verifyEmailVerificationToken */
      INSERT INTO user_email_addresses (user_id, email_address, is_primary)
      VALUES (${userId}, ${normalizedEmailAddress}, ${isPrimary})
      ON CONFLICT (user_id, email_address) DO NOTHING
  `)
  await query.commit()

  await primeVerifiedEmailCache(userId).catch(onError)
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
