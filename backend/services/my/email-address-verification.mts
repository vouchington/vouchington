import { read, beginTransaction } from '@data-stores/psql'
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
