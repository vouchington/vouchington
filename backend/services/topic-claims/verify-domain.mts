import { write } from '@data-stores/psql'
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
import type { TopicClaimWriteContext } from './require-on-topic.mts'

type VerifyTopicClaimDomainDeps = {
  resolveTxtRecords: typeof resolveTxtRecords
  fetchWellKnownToken: typeof fetchWellKnownToken
}

export async function verifyTopicClaimDomain(
  currentUserId: string,
  context: TopicClaimWriteContext,
  deps?: VerifyTopicClaimDomainDeps,
): Promise<TopicClaim> {
  // Read the resolver at call time so a test can replace the DNS module binding.
  const lookup = deps ?? { resolveTxtRecords, fetchWellKnownToken }
  const {
    claim,
    verificationHostname: hostname,
    verificationTokenHash: verification_token_hash,
  } = context
  assert(claim.claimant_user_id === currentUserId, 404, 'Claim not found')
  assert(!claim.rejected_at, 409, 'Claim has been rejected')
  assert(!claim.revoked_at, 409, 'Claim has been revoked')
  assert(!claim.verified_at, 409, 'Claim is already verified')
  assert(hostname, 422, 'Topic has no hostname for domain verification')
  assert(verification_token_hash, 422, 'Verification token not issued yet')

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
    WHERE id = ${claim.id}
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
