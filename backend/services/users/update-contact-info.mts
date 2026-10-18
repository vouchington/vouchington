import { verifyEmailAddressLoginToken, verifyPhoneNumberLoginToken } from './authentication.mts'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { beginTransaction } from '@data-stores/psql'
import { getPrivateUserByAny } from './get.mts'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { resolveEmailDomainHostnameId } from '@services/email-address-validator/email-domain-context'

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/README.md`.
 */
export const updateUserPhoneNumber = async (userId: string, phoneNumber: string, token: string) => {
  const verificationToken = requireVerificationToken(token, 'Phone verification token is required')

  // Normalize before uniqueness check so the validated form is compared
  const { success, phoneNumber: validatedPhoneNumber } = await verifyPhoneNumberLoginToken(
    phoneNumber,
    verificationToken,
  )
  assert(success, 422, 'Invalid token for phone number')

  // Allow re-promotion of own secondary contact; only block other users' numbers
  const existing = await getPrivateUserByAny(validatedPhoneNumber)
  assert(!existing || existing.id === userId, 422, 'Phone number is already in use')

  await using query = await beginTransaction()
  await query(sql`/* updateUserPhoneNumber */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  const clearPrimaryPhone = sql`/* updateUserPhoneNumber */
      UPDATE user_phone_numbers
      SET is_primary = FALSE
      WHERE user_id = ${userId}
        AND is_primary = TRUE
    `
  const upsertPrimaryPhone = sql`/* updateUserPhoneNumber */
      INSERT INTO user_phone_numbers (user_id, phone_number, is_primary)
      VALUES (${userId}, ${validatedPhoneNumber}, TRUE)
      ON CONFLICT (user_id, phone_number)
      DO UPDATE SET is_primary = TRUE
    `
  await query(clearPrimaryPhone)
  await query(upsertPrimaryPhone)
  await query.commit()

  void enqueueOnUserUpdated(userId)
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review.
 * Evidence: `docs/overview/architecture/services/README.md`.
 */
export const updateUserEmailAddress = async (
  userId: string,
  emailAddress: string,
  token: string,
) => {
  const verificationToken = requireVerificationToken(token, 'Email verification token is required')

  // Normalize before uniqueness check so the validated form is compared
  const { success, emailAddress: validatedEmailAddress } = await verifyEmailAddressLoginToken(
    emailAddress,
    verificationToken,
  )
  assert(success, 422, 'Invalid token for email address')

  // Allow re-promotion of own secondary contact; only block other users' emails
  const existing = await getPrivateUserByAny(validatedEmailAddress)
  assert(!existing || existing.id === userId, 422, 'Email address is already in use')

  await using query = await beginTransaction()
  await query(sql`/* updateUserEmailAddress */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  const emailDomainHostnameId = await resolveEmailDomainHostnameId(validatedEmailAddress, { query })
  const clearPrimaryEmail = sql`/* updateUserEmailAddress */
      UPDATE user_email_addresses
      SET is_primary = FALSE
      WHERE user_id = ${userId}
        AND is_primary = TRUE
    `
  const upsertPrimaryEmail = sql`/* updateUserEmailAddress */
      INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
      VALUES (${userId}, ${validatedEmailAddress}, ${emailDomainHostnameId}, TRUE)
      ON CONFLICT (user_id, email_address)
      DO UPDATE SET is_primary = TRUE,
        email_domain_hostname_id = EXCLUDED.email_domain_hostname_id
    `
  await query(clearPrimaryEmail)
  await query(upsertPrimaryEmail)
  await query.commit()

  void enqueueOnUserUpdated(userId)
}

function requireVerificationToken(token: string, message: string): string {
  assert(typeof token === 'string', 422, message)
  const verificationToken = token.trim()
  assert(verificationToken.length > 0, 422, message)
  return verificationToken
}
