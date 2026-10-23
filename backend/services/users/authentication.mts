import { hashToken as hashSecretToken } from '@modules/token-secrets'
import { validateEmailAddress } from '@services/email-address-validator'
import { withTransactionOptions, type QueryOptions } from '@data-stores/psql'
import {
  lockEmailAuthenticationScope,
  type EmailAuthenticationScope,
} from './email-authentication-scope.mts'
import type { QueryExecutor } from '@data-stores/psql/types'
import {
  enqueueSendEmailAddressLoginToken,
  enqueueSendReauthenticationToken,
} from '@queues/emails/enqueues'
import { assertValidLoginToken, createLoginToken } from './login-token.mts'

const EMAIL_AUTHENTICATION_TOKEN_EXPIRATION_MINUTES = 15
const LOGIN_EXPIRATION = `${EMAIL_AUTHENTICATION_TOKEN_EXPIRATION_MINUTES} minutes`
const EMAIL_LOGIN_TOKEN_PURPOSE = 'email-address-login-token'
export const EMAIL_REAUTH_TOKEN_PURPOSE = 'email-address-re-auth-token'

function hashEmailLoginToken(token: string, scope: EmailAuthenticationScope): string {
  return hashSecretToken(
    scope.purpose === 'login'
      ? EMAIL_LOGIN_TOKEN_PURPOSE
      : `${EMAIL_REAUTH_TOKEN_PURPOSE}:${scope.session.sid}`,
    token,
  )
}

export const createEmailAddressLoginToken = async (
  emailAddress: string,
  scope: EmailAuthenticationScope = { purpose: 'login' },
  options: QueryOptions = {},
) => {
  const validatedEmailAddress = await validateEmailAddress(emailAddress)
  const token = createLoginToken()
  return withTransactionOptions(options, async query => {
    await lockEmailAuthenticationScope(validatedEmailAddress, scope, query)
    const sessionId = scope.purpose === 're_auth' ? scope.session.sid : null
    const currentUserId = scope.purpose === 're_auth' ? scope.currentUserId : null
    await lockAuthenticationCodeIssuance(
      query,
      sessionId ? `email-token:re_auth:${sessionId}` : `email-token:login:${validatedEmailAddress}`,
    )
    await query(
      `/* createEmailAddressLoginToken */
       WITH invalidated_tokens AS (
         UPDATE email_address_login_tokens SET invalidated_at = CURRENT_TIMESTAMP
         WHERE purpose = $3 AND consumed_at IS NULL AND invalidated_at IS NULL
           AND (($3 = 'login' AND email_address = $1)
             OR ($3 = 're_auth' AND reauthentication_session_id = $4))
         RETURNING id
       )
       INSERT INTO email_address_login_tokens (email_address, token, purpose, reauthentication_session_id, user_id)
       SELECT $1, $2, $3, $4, $5 FROM (SELECT COUNT(*) FROM invalidated_tokens) AS completed_invalidation`,
      [
        validatedEmailAddress,
        hashEmailLoginToken(token, scope),
        scope.purpose,
        sessionId,
        currentUserId,
      ],
    )
    return { token, emailAddress: validatedEmailAddress }
  })
}

export const verifyEmailAddressLoginToken = async (
  emailAddress: string,
  token: string,
  scope: EmailAuthenticationScope = { purpose: 'login' },
  options: QueryOptions = {},
) => {
  const validatedEmailAddress = await validateEmailAddress(emailAddress)
  const normalizedToken = token.toUpperCase()
  return withTransactionOptions(options, async query => {
    await lockEmailAuthenticationScope(validatedEmailAddress, scope, query)
    const sessionId = scope.purpose === 're_auth' ? scope.session.sid : null
    const currentUserId = scope.purpose === 're_auth' ? scope.currentUserId : null
    const result = await query(
      `/* verifyEmailAddressLoginToken */
       UPDATE email_address_login_tokens SET consumed_at = CURRENT_TIMESTAMP
       WHERE email_address = $1 AND token = $2 AND purpose = $3
         AND reauthentication_session_id IS NOT DISTINCT FROM $4::uuid
         AND user_id IS NOT DISTINCT FROM $5::uuid
         AND invalidated_at IS NULL AND consumed_at IS NULL
         AND id >= fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '${LOGIN_EXPIRATION}' + INTERVAL '1 millisecond')`,
      [
        validatedEmailAddress,
        hashEmailLoginToken(normalizedToken, scope),
        scope.purpose,
        sessionId,
        currentUserId,
      ],
    )
    return { success: result.rowCount === 1, emailAddress: validatedEmailAddress }
  })
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

export async function createAndEnqueueEmailAddressReAuthToken(
  emailAddress: string,
  uiLocale: string | null,
  scope: Extract<EmailAuthenticationScope, { purpose: 're_auth' }>,
): Promise<string> {
  const result = await createEmailAddressLoginToken(emailAddress, scope)
  await enqueueSendReauthenticationToken(
    { emailAddress: result.emailAddress, uiLocale },
    { token: result.token, expiresInMinutes: EMAIL_AUTHENTICATION_TOKEN_EXPIRATION_MINUTES },
  )
  return result.emailAddress
}

async function lockAuthenticationCodeIssuance(
  query: QueryExecutor,
  identity: string,
): Promise<void> {
  await query(
    '/* lockAuthenticationCodeIssuance */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [identity],
  )
}
