import { write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { hashToken } from '@modules/token-secrets'
import { resolveTxtRecords } from './domain-verification-dns.mts'
import { fetchWellKnownToken } from './domain-verification-well-known.mts'
import {
  TOPIC_CLAIM_DNS_TXT_PREFIX,
  type TopicClaim,
  type TopicClaimVerificationMethod,
} from './config.mts'

type VerifyTopicClaimDomainDeps = {
  resolveTxtRecords: typeof resolveTxtRecords
  fetchWellKnownToken: typeof fetchWellKnownToken
}

export async function verifyTopicClaimDomain(
  currentUserId: string,
  claimId: string,
  deps?: VerifyTopicClaimDomainDeps,
): Promise<TopicClaim> {
  // Read the resolver at call time so a test can replace the DNS module binding.
  const lookup = deps ?? { resolveTxtRecords, fetchWellKnownToken }
  const { rows } = await read(sql`/* verifyTopicClaimDomain:getClaim */
    SELECT tc.id, tc.claimant_user_id, tc.verification_token_hash,
           tc.verified_at, tc.rejected_at, tc.revoked_at,
           uh.hostname
    -- no-mistakes-disable-next-line postgres-required-predicates: topic merges transactionally repoint claim foreign keys; verification preserves its recorded hostname
    FROM topic_claims tc
    LEFT JOIN url_hostnames uh ON uh.id = tc.verification_hostname_id
    LEFT JOIN topics t ON t.id = tc.topic_id
    WHERE tc.id = ${claimId}
      AND t.deleted_at IS NULL
    LIMIT 1
  `)
  const claim = rows[0] as
    | {
        id: string
        claimant_user_id: string
        verification_token_hash: string | null
        verified_at: Date | null
        rejected_at: Date | null
        revoked_at: Date | null
        hostname: string | null
      }
    | undefined

  assert(claim, 404, 'Claim not found')
  assert(claim.claimant_user_id === currentUserId, 404, 'Claim not found')
  assert(!claim.rejected_at, 409, 'Claim has been rejected')
  assert(!claim.revoked_at, 409, 'Claim has been revoked')
  assert(!claim.verified_at, 409, 'Claim is already verified')
  assert(claim.hostname, 422, 'Topic has no hostname for domain verification')
  assert(claim.verification_token_hash, 422, 'Verification token not issued yet')

  const { hostname, verification_token_hash } = claim

  let matchedMethod: TopicClaimVerificationMethod | null = null

  try {
    const txtRecords = await lookup.resolveTxtRecords(`${TOPIC_CLAIM_DNS_TXT_PREFIX}.${hostname}`)
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
    const wellKnownContent = await lookup.fetchWellKnownToken(hostname)
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
        verified_at = NOW()
    WHERE id = ${claimId}
      AND claimant_user_id = ${currentUserId}
      AND verified_at IS NULL
      AND rejected_at IS NULL
      AND revoked_at IS NULL
    RETURNING
      id, topic_id, claimant_user_id, verification_method,
      claimed_role, evidence, submitted_at,
      verified_at, verified_by_id, rejected_at, rejected_by_id, rejection_reason,
      revoked_at, revoked_by_id, revocation_reason,
      verification_hostname_id, verification_token_issued_at,
      domain_verified_at, created_at, updated_at
  `)
  const updated = updatedRows[0] as TopicClaim | undefined
  assert(updated, 409, 'Claim is no longer pending')
  return updated
}
