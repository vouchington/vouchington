import { read } from '@data-stores/psql'
import { ValkeyCache } from '@data-stores/valkey/cache'
import sql from 'sql-template-strings'

const CACHE_TTL_SECONDS = 5 * 60

const cache = new ValkeyCache<string>({
  prefix: 'contribution-gating:verified-email',
  ttlSeconds: CACHE_TTL_SECONDS,
})

type VerifiedEmailCandidate = {
  user_id: string
  email_address: string
  is_disposable: boolean
}

async function getVerifiedEmailCandidatesBatch(
  userIds: string[],
): Promise<Map<string, VerifiedEmailCandidate[]>> {
  const results = new Map<string, VerifiedEmailCandidate[]>(userIds.map(userId => [userId, []]))
  if (userIds.length === 0) return results

  const { rows } = await read<VerifiedEmailCandidate>(sql`/* getVerifiedEmailCandidatesBatch */
    WITH candidates AS (
      SELECT user_id, email_address, 0 AS provider_priority,
        CASE WHEN is_primary THEN 0 ELSE 1 END AS address_priority, created_at
      FROM user_email_addresses WHERE user_id = ANY(${userIds}::uuid[])
      UNION ALL SELECT user_id, apple_user_email_address, 1, 0, created_at FROM apple_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND apple_user_email_address IS NOT NULL
      UNION ALL SELECT user_id, google_user_email_address, 2, 0, created_at FROM google_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND google_user_email_address IS NOT NULL
      UNION ALL SELECT user_id, linkedin_user_email_address, 3, 0, created_at FROM linkedin_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND linkedin_user_email_address IS NOT NULL
      UNION ALL SELECT user_id, github_user_email_address, 4, 0, created_at FROM github_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND github_user_email_address IS NOT NULL
      UNION ALL SELECT user_id, facebook_user_email_address, 5, 0, created_at FROM facebook_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND facebook_user_email_address IS NOT NULL
      UNION ALL SELECT user_id, microsoft_user_email_address, 6, 0, created_at FROM microsoft_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND microsoft_user_email_address IS NOT NULL
    )
    SELECT candidates.user_id, candidates.email_address, EXISTS (
      SELECT 1 FROM domain_blacklists db
      INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
      WHERE db.domain = LOWER(split_part(candidates.email_address, '@', 2))
        AND dbs.type = 'email'::domain_blacklist_types
    ) AS is_disposable
    FROM candidates
    INNER JOIN users ON users.id = candidates.user_id AND users.deleted_at IS NULL
    ORDER BY candidates.user_id, provider_priority, address_priority,
      candidates.created_at, candidates.email_address
  `)

  for (const row of rows) results.get(row.user_id)?.push(row)
  return results
}

export async function getVerifiedEmailAddressesBatch(
  userIds: string[],
): Promise<Map<string, string | null>> {
  const candidates = await getVerifiedEmailCandidatesBatch(userIds)
  return new Map(
    userIds.map(userId => [userId, candidates.get(userId)?.[0]?.email_address ?? null]),
  )
}

export async function getVerifiedEmailAddress(userId: string): Promise<string | null> {
  return (await getVerifiedEmailAddressesBatch([userId])).get(userId) ?? null
}

async function fetchHasVerifiedNonDisposableEmail(userId: string): Promise<{ hasEmail: boolean }> {
  const candidates = await getVerifiedEmailCandidatesBatch([userId])
  return { hasEmail: candidates.get(userId)?.some(candidate => !candidate.is_disposable) ?? false }
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
