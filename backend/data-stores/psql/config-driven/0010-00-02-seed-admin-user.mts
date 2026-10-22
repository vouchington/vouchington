import { ADMIN_EMAIL_ADDRESS } from '@voucha/config'
import { isEmailAddress } from '@ts-shared/utils/validation-core'
import pg from 'pg'
import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

/** @public loaded by path by the config-driven migration runner */
export default function generateSeedAdminUserSQL(options: { emailAddress?: string } = {}): string {
  const parts: string[] = [
    '-- Reserve the official bootstrap identity; configure email to grant administrator access',
  ]

  parts.push(buildSystemUserUpsertSQL('jong', 'official'))

  const emailAddress = (options.emailAddress ?? ADMIN_EMAIL_ADDRESS)?.trim().toLowerCase()
  if (!emailAddress) return parts.join('\n')
  if (!isEmailAddress(emailAddress))
    throw new Error('ADMIN_EMAIL_ADDRESS must be a valid email address')
  const emailLiteral = pg.escapeLiteral(emailAddress)
  const domainLiteral = pg.escapeLiteral(emailAddress.slice(emailAddress.lastIndexOf('@') + 1))

  parts.push(`
INSERT INTO url_hostnames (hostname, publicly_introduced_at) VALUES (${domainLiteral}, CURRENT_TIMESTAMP)
ON CONFLICT (hostname) DO NOTHING;
UPDATE url_hostnames SET publicly_introduced_at = COALESCE(publicly_introduced_at, CURRENT_TIMESTAMP)
WHERE hostname = ${domainLiteral} AND publicly_introduced_at IS NULL;

INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
SELECT u.id, ${emailLiteral}, email_domain.id, TRUE
FROM users u CROSS JOIN url_hostnames email_domain
WHERE u.username = 'jong' AND u.platform_account_kind = 'official'
  AND email_domain.hostname = ${domainLiteral}
  AND NOT EXISTS (
    SELECT 1 FROM user_email_addresses
    WHERE email_address = ${emailLiteral} AND is_primary = TRUE
  )
ON CONFLICT (user_id, email_address) DO UPDATE SET is_primary = TRUE;`)

  parts.push(`
INSERT INTO user_roles (user_id, role_type_id)
SELECT u.id, urt.id FROM users u, user_role_types urt
WHERE u.username = 'jong' AND u.platform_account_kind = 'official' AND urt.slug = 'administrator'
ON CONFLICT (user_id, role_type_id) DO NOTHING;`)

  return parts.join('\n')
}
