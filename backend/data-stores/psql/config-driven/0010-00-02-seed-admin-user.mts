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
ON CONFLICT (user_id, email_address) DO UPDATE SET is_primary = TRUE;`)

  // The admin account is the only bootstrap seed with a primary email before
  // the cross-table admission triggers are installed. Seed its current rows
  // directly so the first hourly dispatch has the same eligible population.
  parts.push(`
INSERT INTO user_engagement_email_candidates (user_id, email_type, claimed_at)
SELECT u.id, kind.email_type, send.claimed_at
FROM users u
JOIN user_email_addresses address ON address.user_id = u.id AND address.is_primary = TRUE
CROSS JOIN UNNEST(enum_range(NULL::engagement_email_types)) AS kind(email_type)
LEFT JOIN user_engagement_email_sends send
  ON send.user_id = u.id AND send.email_type = kind.email_type
WHERE u.username = 'jong' AND u.platform_account_kind = 'official'
  AND u.deleted_at IS NULL AND u.is_engagement_emails_enabled = TRUE
  AND u.processing_restricted_at IS NULL
  AND send.sent_at IS NULL AND send.delivery_attempted_at IS NULL
ON CONFLICT (email_type, user_id) DO UPDATE SET claimed_at = EXCLUDED.claimed_at;`)

  parts.push(`
INSERT INTO user_roles (user_id, role_type_id)
SELECT u.id, urt.id FROM users u, user_role_types urt
WHERE u.username = 'jong' AND u.platform_account_kind = 'official' AND urt.slug = 'administrator'
ON CONFLICT (user_id, role_type_id) DO NOTHING;`)

  return parts.join('\n')
}
