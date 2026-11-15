import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

/** loaded by path by the config-driven migration runner */
export default function generateSeedAdminUserSQL(): string {
  return buildSeedAdminUserSQL('jong', 'jong@voucha.ai')
}

/** Build the canonical official-account seed for a trusted reserved identity. */
export function buildSeedAdminUserSQL(username: string, emailAddress: string): string {
  const escapedUsername = username.replaceAll("'", "''")
  const escapedEmail = emailAddress.replaceAll("'", "''")
  const escapedDomain = emailAddress.slice(emailAddress.lastIndexOf('@') + 1).replaceAll("'", "''")
  const parts: string[] = ['-- Create official admin user and grant administrator role']

  parts.push(buildSystemUserUpsertSQL(username, 'official'))

  parts.push(`
INSERT INTO url_hostnames (hostname, publicly_introduced_at) VALUES ('${escapedDomain}', CURRENT_TIMESTAMP)
ON CONFLICT (hostname) DO NOTHING;
UPDATE url_hostnames SET publicly_introduced_at = COALESCE(publicly_introduced_at, CURRENT_TIMESTAMP)
WHERE hostname = '${escapedDomain}' AND publicly_introduced_at IS NULL;

DO $email_capacity$
DECLARE
  seeded_user_id UUID;
  existing_email_count INTEGER;
BEGIN
  SELECT id INTO seeded_user_id FROM users
  WHERE username = '${escapedUsername}' AND platform_account_kind = 'official';
  IF NOT EXISTS (
    SELECT 1 FROM user_email_addresses
    WHERE user_id = seeded_user_id AND email_address = '${escapedEmail}'
  ) THEN
    SELECT COUNT(*) INTO existing_email_count FROM (
      SELECT id FROM user_email_addresses WHERE user_id = seeded_user_id LIMIT 10
    ) existing_emails;
    IF existing_email_count >= 10 THEN
      RAISE EXCEPTION 'Official account email limit reached' USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$email_capacity$;

INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
SELECT u.id, '${escapedEmail}', email_domain.id, TRUE
FROM users u CROSS JOIN url_hostnames email_domain
WHERE u.username = '${escapedUsername}' AND u.platform_account_kind = 'official'
  AND email_domain.hostname = '${escapedDomain}'
  AND NOT EXISTS (
    SELECT 1 FROM user_email_addresses
    WHERE email_address = '${escapedEmail}' AND is_primary = TRUE
  )
ON CONFLICT (user_id, email_address) DO UPDATE SET is_primary = TRUE;`)

  parts.push(`
INSERT INTO user_roles (user_id, role_type_id)
SELECT u.id, urt.id FROM users u, user_role_types urt
WHERE u.username = '${escapedUsername}' AND u.platform_account_kind = 'official' AND urt.slug = 'administrator'
ON CONFLICT (user_id, role_type_id) DO NOTHING;`)

  return parts.join('\n')
}
