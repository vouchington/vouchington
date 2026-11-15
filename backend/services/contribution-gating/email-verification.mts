import { read } from '@data-stores/psql'
import { ValkeyCache } from '@data-stores/valkey/cache'
import sql from 'sql-template-strings'

const CACHE_TTL_SECONDS = 5 * 60

const cache = new ValkeyCache({
  prefix: 'contribution-gating:verified-email',
  ttlSeconds: CACHE_TTL_SECONDS,
})

type VerifiedEmailState = {
  user_id: string
  email_address: string | null
  has_non_disposable: boolean
}

async function getVerifiedEmailStatesBatch(
  userIds: string[],
): Promise<Map<string, VerifiedEmailState>> {
  if (userIds.length === 0) return new Map()

  const { rows } = await read<VerifiedEmailState>(sql`/* getVerifiedEmailStatesBatch */
    SELECT u.id AS user_id,
      COALESCE(
        (SELECT email.email_address FROM user_email_addresses email
         WHERE email.user_id = u.id
         ORDER BY CASE WHEN email.is_primary THEN 0 ELSE 1 END, email.id, email.email_address
         LIMIT 1),
        apple.apple_user_email_address, google.google_user_email_address,
        linkedin.linkedin_user_email_address, github.github_user_email_address,
        facebook.facebook_user_email_address, microsoft.microsoft_user_email_address
      ) AS email_address,
      (EXISTS (
        SELECT 1 FROM user_email_addresses email
        WHERE email.user_id = u.id AND NOT EXISTS (
          SELECT 1 FROM url_hostname_blocks block
          WHERE block.url_hostname_id = email.email_domain_hostname_id
            AND block.blocked_source = 'email_blocklist' AND block.lifted_at IS NULL
        )
      ) OR EXISTS (
        SELECT 1 FROM (VALUES
          (apple.apple_user_email_address, apple.email_domain_hostname_id),
          (google.google_user_email_address, google.email_domain_hostname_id),
          (linkedin.linkedin_user_email_address, linkedin.email_domain_hostname_id),
          (github.github_user_email_address, github.email_domain_hostname_id),
          (facebook.facebook_user_email_address, facebook.email_domain_hostname_id),
          (microsoft.microsoft_user_email_address, microsoft.email_domain_hostname_id)
        ) provider(email_address, hostname_id)
        WHERE provider.email_address IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM url_hostname_blocks block
          WHERE block.url_hostname_id = provider.hostname_id
            AND block.blocked_source = 'email_blocklist' AND block.lifted_at IS NULL
        )
      )) AS has_non_disposable
    FROM users u
    LEFT JOIN apple_accounts apple ON apple.user_id = u.id
    LEFT JOIN google_accounts google ON google.user_id = u.id
    LEFT JOIN linkedin_accounts linkedin ON linkedin.user_id = u.id
    LEFT JOIN github_accounts github ON github.user_id = u.id
    LEFT JOIN facebook_accounts facebook ON facebook.user_id = u.id
    LEFT JOIN microsoft_accounts microsoft ON microsoft.user_id = u.id
    WHERE u.id = ANY(${userIds}::uuid[]) AND u.deleted_at IS NULL
  `)

  return new Map(rows.map(row => [row.user_id, row]))
}

export async function getVerifiedEmailAddressesBatch(
  userIds: string[],
): Promise<Map<string, string | null>> {
  const states = await getVerifiedEmailStatesBatch(userIds)
  return new Map(userIds.map(userId => [userId, states.get(userId)?.email_address ?? null]))
}

export async function getVerifiedEmailAddress(userId: string): Promise<string | null> {
  return (await getVerifiedEmailAddressesBatch([userId])).get(userId) ?? null
}

async function fetchHasVerifiedNonDisposableEmail(userId: string): Promise<{ hasEmail: boolean }> {
  const states = await getVerifiedEmailStatesBatch([userId])
  return { hasEmail: states.get(userId)?.has_non_disposable ?? false }
}

const fetchHasVerifiedNonDisposableEmailCached = cache.cacheGetByAny(
  fetchHasVerifiedNonDisposableEmail,
)

export async function hasVerifiedNonDisposableEmail(userId: string): Promise<boolean> {
  const result = await fetchHasVerifiedNonDisposableEmailCached(userId)
  return result?.hasEmail ?? false
}

export function invalidateVerifiedEmailCache(userId: string): Promise<number> {
  return cache.delete(userId)
}

export async function primeVerifiedEmailCache(userId: string): Promise<void> {
  await invalidateVerifiedEmailCache(userId)
  await hasVerifiedNonDisposableEmail(userId)
}
