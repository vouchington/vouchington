import { hashToken as hashSecretToken } from '@modules/token-secrets'
import { verifyPhoneNumber } from '@modules/utils'
import { validateEmailAddress } from '@services/email-address-validator'
import { write } from '@data-stores/psql'
import { enqueueSendEmailAddressLoginToken } from '@queues/emails/enqueues'
import { assertValidLoginToken, createLoginToken } from './login-token.mts'

const LOGIN_EXPIRATION = '15 minutes'
const EMAIL_LOGIN_TOKEN_PURPOSE = 'email-address-login-token'
const PHONE_LOGIN_TOKEN_PURPOSE = 'phone-number-login-token'

function hashEmailLoginToken(token: string): string {
  return hashSecretToken(EMAIL_LOGIN_TOKEN_PURPOSE, token)
}

function hashPhoneLoginToken(token: string): string {
  return hashSecretToken(PHONE_LOGIN_TOKEN_PURPOSE, token)
}

export const createEmailAddressLoginToken = async (emailAddress: string) => {
  const validatedEmailAddress = await validateEmailAddress(emailAddress)
  const token = createLoginToken()
  await write(
    '/* createEmailAddressLoginToken */ INSERT INTO email_address_login_tokens (email_address, token) VALUES ($1, $2)',
    [validatedEmailAddress, hashEmailLoginToken(token)],
  )
  return {
    token,
    emailAddress: validatedEmailAddress,
  }
}

export const createPhoneNumberLoginToken = async (phoneNumber: string) => {
  const validatedPhoneNumber = await verifyPhoneNumber(phoneNumber)
  const token = createLoginToken()
  await write(
    '/* createPhoneNumberLoginToken */ INSERT INTO phone_number_login_tokens (phone_number, token) VALUES ($1, $2)',
    [validatedPhoneNumber, hashPhoneLoginToken(token)],
  )
  return {
    token,
    phoneNumber: validatedPhoneNumber,
  }
}

export const verifyEmailAddressLoginToken = async (emailAddress: string, token: string) => {
  const validatedEmailAddress = await validateEmailAddress(emailAddress)
  const normalizedToken = token.toUpperCase()
  const result = await write(
    `/* verifyEmailAddressLoginToken */
    UPDATE email_address_login_tokens
    SET logged_in_at = CURRENT_TIMESTAMP
    WHERE email_address = $1
      AND token = $2
      AND logged_in_at IS NULL
      AND created_at > CURRENT_TIMESTAMP - INTERVAL '${LOGIN_EXPIRATION}'
    `,
    [validatedEmailAddress, hashEmailLoginToken(normalizedToken)],
  )
  return {
    success: result.rowCount === 1,
    emailAddress: validatedEmailAddress,
  }
}

export const verifyPhoneNumberLoginToken = async (phoneNumber: string, token: string) => {
  const validatedPhoneNumber = await verifyPhoneNumber(phoneNumber)
  const normalizedToken = token.toUpperCase()
  const { rowCount } = await write(
    `/* verifyPhoneNumberLoginToken */
    UPDATE phone_number_login_tokens
    SET logged_in_at = CURRENT_TIMESTAMP
    WHERE phone_number = $1
      AND token = $2
      AND logged_in_at IS NULL
      AND created_at > CURRENT_TIMESTAMP - INTERVAL '${LOGIN_EXPIRATION}'
    `,
    [validatedPhoneNumber, hashPhoneLoginToken(normalizedToken)],
  )
  return {
    success: rowCount === 1,
    phoneNumber: validatedPhoneNumber,
  }
}

export const enqueueEmailAddressLoginToken = (
  emailAddress: string,
  token: string,
  uiLocale?: string | null,
) => {
  assertValidLoginToken(token)
  return enqueueSendEmailAddressLoginToken(
    { emailAddress, ...(uiLocale !== undefined && { uiLocale }) },
    { token, expiration: LOGIN_EXPIRATION },
  )
}
