import { read } from '@data-stores/psql'
import type { DeployEnvironmentSource } from '@ts-shared/deploy-environment'
import sql from 'sql-template-strings'
import validator from 'validator'
import { sanitizeEmailAddress } from './sanitize.mts'
import { validateEmailDomain } from './domain-validation.mts'
import { EmailFormatInvalidError } from './errors.mts'

const { isEmail } = validator

const hasEmailBeenUsedForLogin = async (emailAddress: string): Promise<boolean> => {
  const query = sql`/* hasEmailBeenUsedForLogin */
    SELECT 1 FROM email_address_login_tokens
    WHERE email_address = ${emailAddress}
      AND logged_in_at IS NOT NULL
    LIMIT 1
  `
  const result = await read(query)
  return result.rows.length > 0
}

export const validateEmailAddress = async (
  emailAddress: string,
  env: DeployEnvironmentSource = process.env,
): Promise<string> => {
  // 1. Sanitize email
  const sanitized = sanitizeEmailAddress(emailAddress, env)

  // 2. Validate format
  if (!isEmail(sanitized)) {
    throw new EmailFormatInvalidError(sanitized)
  }

  // 3. Extract domain from email (part after '@')
  const atIndex = sanitized.indexOf('@')
  if (atIndex === -1) {
    throw new EmailFormatInvalidError(sanitized)
  }
  const domain = sanitized.slice(atIndex + 1)

  // 4. Early return optimization: Check if email was previously used for login
  const hasBeenUsedForLogin = await hasEmailBeenUsedForLogin(sanitized)
  if (hasBeenUsedForLogin) {
    // Email was previously used for login, skip domain validation
    return sanitized
  }

  // 5. Validate domain (throws if invalid)
  await validateEmailDomain(domain)

  // 6. Return sanitized email
  return sanitized
}
