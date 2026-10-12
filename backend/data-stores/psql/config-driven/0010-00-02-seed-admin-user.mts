import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

/** @public loaded by path by the config-driven migration runner */
export default function generateSeedAdminUserSQL(): string {
  const parts: string[] = ['-- Create jong admin user and grant administrator role']

  parts.push(buildSystemUserUpsertSQL('jong', 'official'))

  parts.push(`
WITH email_domain AS (
  INSERT INTO url_hostnames (hostname) VALUES ('voucha.ai')
  ON CONFLICT (hostname) DO UPDATE SET hostname = EXCLUDED.hostname
  RETURNING id
)
INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
SELECT u.id, 'jong@voucha.ai', email_domain.id, TRUE
FROM users u CROSS JOIN email_domain
WHERE u.username = 'jong' AND u.platform_account_kind = 'official'
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
