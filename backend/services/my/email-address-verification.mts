import { getUserEmailAddressesMax, USER_EMAIL_ADDRESSES_MAX } from '@services/user-product-limits'
import {
  runWithTransaction,
  registerPostCommitAction,
  type TransactionQuery,
} from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { createCodedError } from '@vouchington/sentry'
import { EMAIL_ADDRESS_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { validateEmailAddress } from '@services/email-address-validator'
import { resolveEmailDomainHostnameId } from '@services/email-address-validator/email-domain-context'
import { createLoginToken } from '@services/users/login-token'
import { hashToken } from '@modules/token-secrets'
import {
  invalidateVerifiedEmailCache,
  primeVerifiedEmailCache,
} from '@services/contribution-gating/email-verification'
import onError from '@modules/on-error'
import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'

async function assertEmailAddressAvailableForUser(
  userId: string,
  normalizedEmail: string,
  query: TransactionQuery,
): Promise<void> {
  const { rows } = await query<{
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
  options: { query?: TransactionQuery } = {},
): Promise<{ token: string; normalizedEmail: string }> {
  const validated = await validateEmailAddress(emailAddress)
  const normalized = validated.toLowerCase()
  const token = createLoginToken()
  const tokenHash = hashToken('email-address-verification-token', token)

  await runWithTransaction(options.query, async query => {
    await query(
      sql`/* createEmailVerificationToken */ SELECT fn_lock_active_user_for_mutation(${userId})`,
    )
    await assertEmailAddressAvailableForUser(userId, normalized, query)
    return persistEmailVerificationToken(userId, normalized, tokenHash, query)
  })

  return { token, normalizedEmail: normalized }
}

export async function verifyEmailVerificationToken(
  userId: string,
  emailAddress: string,
  token: string,
  options: { query?: TransactionQuery } = {},
): Promise<void> {
  const normalized = emailAddress.toLowerCase().trim()
  const normalizedToken = token.toUpperCase().trim()
  const tokenHash = hashToken('email-address-verification-token', normalizedToken)

  await conflictOnSerializationFailure(() =>
    runWithTransaction(
      options.query,
      async query => {
        await verifyTokenAndAddEmailAddress(userId, normalized, tokenHash, query)
        registerPostCommitAction(query, async () => {
          await invalidateVerifiedEmailCache(userId).catch(onError)
          await primeVerifiedEmailCache(userId).catch(onError)
          void enqueueOnUserUpdated(userId)
        })
      },
      { serializable: true },
    ),
  )
}

async function verifyTokenAndAddEmailAddress(
  userId: string,
  normalizedEmailAddress: string,
  normalizedToken: string,
  query: TransactionQuery,
): Promise<void> {
  await query(
    sql`/* verifyEmailVerificationToken */ SELECT fn_lock_active_user_for_mutation(${userId})`,
  )
  const { rowCount } = await query(sql`/* verifyEmailVerificationToken */
      DELETE FROM email_address_login_tokens
      WHERE user_id = ${userId}
        AND email_address = ${normalizedEmailAddress}
        AND token = ${normalizedToken}
        AND purpose = 'email_verification'
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
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

  const { rows: existingEmails } = await query<{ email_address: string }>(sql`
    /* verifyEmailVerificationToken:capacity */
    SELECT email_address FROM user_email_addresses WHERE user_id = ${userId} LIMIT ${USER_EMAIL_ADDRESSES_MAX}
  `)
  if (
    existingEmails.length >= getUserEmailAddressesMax() &&
    !existingEmails.some(row => row.email_address === normalizedEmailAddress)
  )
    throw createCodedError(400, 'Email address limit reached', EMAIL_ADDRESS_LIMIT_REACHED)

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
}

async function persistEmailVerificationToken(
  userId: string,
  normalized: string,
  tokenHash: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* createEmailVerificationToken */
      INSERT INTO email_address_login_tokens (email_address, token, user_id, purpose)
      VALUES (${normalized}, ${tokenHash}, ${userId}, 'email_verification')
      ON CONFLICT (user_id, email_address) WHERE purpose = 'email_verification'
      DO UPDATE SET
        id = uuidv7(),
        token = ${tokenHash},
        consumed_at = NULL,
        invalidated_at = NULL
    `)
}
