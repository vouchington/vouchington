import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

/** @public loaded by path by the config-driven migration runner */
export default function generateSeedAdminUserSQL(): string {
  const parts: string[] = ['-- Create jong admin user and grant administrator role']

  parts.push(buildSystemUserUpsertSQL('jong', 'official'))

  parts.push(`
INSERT INTO user_email_addresses (user_id, email_address, is_primary)
SELECT u.id, 'jong@voucha.ai', TRUE FROM users u WHERE u.username = 'jong' AND u.platform_account_kind = 'official'
  AND NOT EXISTS (
    SELECT 1 FROM user_email_addresses
    WHERE email_address = 'jong@voucha.ai' AND is_primary = TRUE
  )
ON CONFLICT (user_id, email_address) DO UPDATE SET is_primary = TRUE;`)

  parts.push(`
INSERT INTO user_roles (user_id, role_type_id)
SELECT u.id, urt.id FROM users u, user_role_types urt
WHERE u.username = 'jong' AND u.platform_account_kind = 'official' AND urt.slug = 'administrator'
ON CONFLICT (user_id, role_type_id) DO NOTHING;`)

  return parts.join('\n')
}
