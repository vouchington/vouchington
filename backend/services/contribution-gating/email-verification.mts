import { runDetachedBackgroundWork } from '@modules/utils/detached-background-work'
import { read } from '@data-stores/psql'
import { ValkeyCache } from '@data-stores/valkey/cache'
import sql from 'sql-template-strings'

const CACHE_TTL_SECONDS = 5 * 60

const cache = new ValkeyCache({
  runBackgroundRefresh: runDetachedBackgroundWork,
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
      SELECT id AS source_id, user_id, email_address, email_domain_hostname_id, 0 AS provider_priority,
        CASE WHEN is_primary THEN 0 ELSE 1 END AS address_priority, created_at
      FROM user_email_addresses WHERE user_id = ANY(${userIds}::uuid[])
      UNION ALL SELECT NULL::UUID, user_id, apple_user_email_address, email_domain_hostname_id, 1, 0, created_at FROM apple_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND apple_user_email_address IS NOT NULL
      UNION ALL SELECT NULL::UUID, user_id, google_user_email_address, email_domain_hostname_id, 2, 0, created_at FROM google_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND google_user_email_address IS NOT NULL
      UNION ALL SELECT NULL::UUID, user_id, linkedin_user_email_address, email_domain_hostname_id, 3, 0, created_at FROM linkedin_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND linkedin_user_email_address IS NOT NULL
      UNION ALL SELECT NULL::UUID, user_id, github_user_email_address, email_domain_hostname_id, 4, 0, created_at FROM github_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND github_user_email_address IS NOT NULL
      UNION ALL SELECT NULL::UUID, user_id, facebook_user_email_address, email_domain_hostname_id, 5, 0, created_at FROM facebook_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND facebook_user_email_address IS NOT NULL
      UNION ALL SELECT NULL::UUID, user_id, microsoft_user_email_address, email_domain_hostname_id, 6, 0, created_at FROM microsoft_accounts
        WHERE user_id = ANY(${userIds}::uuid[]) AND microsoft_user_email_address IS NOT NULL
    )
    SELECT candidates.user_id, candidates.email_address, EXISTS (
      SELECT 1 FROM url_hostname_blocks block
      WHERE block.url_hostname_id = candidates.email_domain_hostname_id
        AND block.blocked_source = 'email_blocklist'
        AND block.lifted_at IS NULL
    ) AS is_disposable
    FROM candidates
    INNER JOIN users ON users.id = candidates.user_id AND users.deleted_at IS NULL
    ORDER BY candidates.user_id, provider_priority, address_priority,
      candidates.created_at, candidates.source_id NULLS LAST, candidates.email_address
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
