import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

/** loaded by path by the config-driven migration runner */
export default function generateSeedAdminUserSQL(): string {
  const parts: string[] = ['-- Create jong admin user and grant administrator role']

  parts.push(buildSystemUserUpsertSQL('jong', 'official'))

  parts.push(`
INSERT INTO url_hostnames (hostname, publicly_introduced_at) VALUES ('voucha.ai', CURRENT_TIMESTAMP)
ON CONFLICT (hostname) DO NOTHING;
UPDATE url_hostnames SET publicly_introduced_at = COALESCE(publicly_introduced_at, CURRENT_TIMESTAMP)
WHERE hostname = 'voucha.ai' AND publicly_introduced_at IS NULL;

INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
SELECT u.id, 'jong@voucha.ai', email_domain.id, TRUE
FROM users u CROSS JOIN url_hostnames email_domain
WHERE u.username = 'jong' AND u.platform_account_kind = 'official'
  AND email_domain.hostname = 'voucha.ai'
  AND NOT EXISTS (
    SELECT 1 FROM user_email_addresses
    WHERE email_address = 'jong@voucha.ai' AND is_primary = TRUE
  )
ON CONFLICT (user_id, email_address) DO NOTHING;
UPDATE user_email_addresses SET is_primary = TRUE
WHERE email_address = 'jong@voucha.ai' AND is_primary IS DISTINCT FROM TRUE
  AND user_id = (
    SELECT id FROM users WHERE username = 'jong' AND platform_account_kind = 'official'
  );`)

  parts.push(`
INSERT INTO user_roles (user_id, role_type_id)
SELECT u.id, urt.id FROM users u, user_role_types urt
WHERE u.username = 'jong' AND u.platform_account_kind = 'official' AND urt.slug = 'administrator'
ON CONFLICT (user_id, role_type_id) DO NOTHING;`)

  return parts.join('\n')
}
