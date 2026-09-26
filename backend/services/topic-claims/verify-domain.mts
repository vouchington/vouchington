import { write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { hashToken } from '@modules/token-secrets'
import { resolveTxtRecords } from './domain-verification-dns.mts'
import { fetchWellKnownToken } from './domain-verification-well-known.mts'
import type { TopicClaim, TopicClaimVerificationMethod } from './config.mts'

type VerifyTopicClaimDomainDeps = {
  resolveTxtRecords: typeof resolveTxtRecords
  fetchWellKnownToken: typeof fetchWellKnownToken
}

const defaultDeps: VerifyTopicClaimDomainDeps = {
  resolveTxtRecords,
  fetchWellKnownToken,
}

export async function verifyTopicClaimDomain(
  currentUserId: string,
  claimId: string,
  deps: VerifyTopicClaimDomainDeps = defaultDeps,
): Promise<TopicClaim> {
  const { rows } = await read(sql`/* verifyTopicClaimDomain:getClaim */
    SELECT tc.id, tc.claimant_user_id, tc.verification_token_hash,
           tc.verified_at, tc.rejected_at,
           uh.hostname
    FROM topic_claims tc
    LEFT JOIN url_hostnames uh ON uh.id = tc.verification_hostname_id
    WHERE tc.id = ${claimId}
    LIMIT 1
  `)
  const claim = rows[0] as
    | {
        id: string
        claimant_user_id: string
        verification_token_hash: string | null
        verified_at: Date | null
        rejected_at: Date | null
        hostname: string | null
      }
    | undefined

  assert(claim, 404, 'Claim not found')
  assert(claim.claimant_user_id === currentUserId, 403, 'Forbidden')
  assert(claim.hostname, 422, 'Topic has no hostname for domain verification')
  assert(claim.verification_token_hash, 422, 'Verification token not issued yet')
  assert(!claim.verified_at, 409, 'Claim is already verified')

  const { hostname, verification_token_hash } = claim

  let matchedMethod: TopicClaimVerificationMethod | null = null

  try {
    const txtRecords = await deps.resolveTxtRecords(hostname)
    for (const record of txtRecords) {
      const recordHash = hashToken('topic_claim_domain', record)
      if (recordHash === verification_token_hash) {
        matchedMethod = 'dns_txt'
        break
      }
    }
  } catch {
    // DNS lookup failed; try well-known
  }

  if (!matchedMethod) {
    const wellKnownContent = await deps.fetchWellKnownToken(hostname)
    if (wellKnownContent) {
      const contentHash = hashToken('topic_claim_domain', wellKnownContent)
      if (contentHash === verification_token_hash) {
        matchedMethod = 'well_known_file'
      }
    }
  }

  assert(
    matchedMethod,
    422,
    'Verification token not found. Ensure the DNS TXT record or well-known file is in place and try again.',
  )

  const { rows: updatedRows } = await write(sql`/* verifyTopicClaimDomain:verify */
    UPDATE topic_claims
    SET verification_method = ${matchedMethod},
        domain_verified_at = NOW(),
        verified_at = NOW(),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${claimId} AND claimant_user_id = ${currentUserId}
    RETURNING
      id, topic_id, claimant_user_id, verification_method,
      claimed_role, evidence, submitted_at,
      verified_at, verified_by_id, rejected_at, rejected_by_id, rejection_reason,
      revoked_at, revoked_by_id, revocation_reason,
      verification_hostname_id, verification_token_issued_at,
      domain_verified_at, updated_at
  `)
  const updated = updatedRows[0] as TopicClaim | undefined
  assert(updated, 500, 'Failed to update claim')
  return updated
}
