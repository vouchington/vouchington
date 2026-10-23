import { read } from '@data-stores/psql'
import type { DeployEnvironmentSource } from '@ts-shared/deploy-environment'
import sql from 'sql-template-strings'
import validator from 'validator'
import { sanitizeEmailAddress } from './sanitize.mts'
import { validateEmailDomain } from './domain-validation.mts'
import { EmailFormatInvalidError } from './errors.mts'

const { isEmail } = validator

const hasAssociatedEmailAddress = async (emailAddress: string): Promise<boolean> => {
  const query = sql`/* hasAssociatedEmailAddress */
    SELECT 1 FROM user_email_addresses
    WHERE email_address = ${emailAddress}
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

  // 4. An existing associated address can remain usable after its domain stops validating.
  const hasAssociatedAddress = await hasAssociatedEmailAddress(sanitized)
  if (hasAssociatedAddress) {
    return sanitized
  }

  // 5. Validate domain (throws if invalid)
  await validateEmailDomain(domain)

  // 6. Return sanitized email
  return sanitized
}
