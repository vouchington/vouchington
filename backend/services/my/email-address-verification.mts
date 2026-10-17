import { read, beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { validateEmailAddress } from '@services/email-address-validator'
import { resolveEmailDomainHostnameId } from '@services/email-address-validator/email-domain-context'
import { createLoginToken } from '@services/users/login-token'
import { hashToken } from '@modules/token-secrets'
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
  const { rows } = await read<{
    existing_user_id: string | null
    already_added: boolean
  }>(sql`/* assertEmailAddressAvailableForUser */
    SELECT
      (SELECT user_id FROM user_email_addresses
       WHERE email_address = ${normalizedEmail} LIMIT 1) AS existing_user_id,
      EXISTS (
        SELECT 1 FROM user_email_addresses
        WHERE user_id = ${userId} AND email_address = ${normalizedEmail}
      ) AS already_added
  `)
  const row = rows[0]!
  assert(
    row.existing_user_id === null || row.existing_user_id === userId,
    422,
    'Email address is already in use',
  )

  assert(!row.already_added, 422, 'Email address already added to your account')
}

export async function createEmailVerificationToken(
  userId: string,
  emailAddress: string,
): Promise<{ token: string; normalizedEmail: string }> {
  const validated = await validateEmailAddress(emailAddress)
  const normalized = validated.toLowerCase()
  await assertEmailAddressAvailableForUser(userId, normalized)

  const token = createLoginToken()
  const tokenHash = hashToken('email-address-verification-token', token)

  await using query = await beginTransaction()
  await query(
    sql`/* createEmailVerificationToken */ SELECT fn_lock_active_user_for_mutation(${userId})`,
  )
  await query(sql`/* createEmailVerificationToken */
      INSERT INTO email_address_login_tokens (email_address, token, user_id)
      VALUES (${normalized}, ${tokenHash}, ${userId})
      ON CONFLICT (user_id, email_address) WHERE user_id IS NOT NULL
      DO UPDATE SET
        id = uuidv7(),
        token = ${tokenHash},
        logged_in_at = NULL
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
  const tokenHash = hashToken('email-address-verification-token', normalizedToken)

  await invalidateVerifiedEmailCache(userId).catch(onError)

  await verifyTokenAndPrimeEmailCache(userId, normalized, tokenHash)

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
        AND id >= fn_min_uuidv7(NOW() - INTERVAL '30 minutes' + INTERVAL '1 millisecond')
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

  const emailDomainHostnameId = await resolveEmailDomainHostnameId(normalizedEmailAddress, {
    query,
  })

  await query(sql`/* verifyEmailVerificationToken */
      INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
      SELECT ${userId}::uuid, ${normalizedEmailAddress}::text, ${emailDomainHostnameId}::uuid, NOT EXISTS (
        SELECT 1 FROM user_email_addresses WHERE user_id = ${userId}::uuid
      )
      ON CONFLICT (user_id, email_address) DO NOTHING
  `)
  await query.commit()

  await primeVerifiedEmailCache(userId).catch(onError)
}
