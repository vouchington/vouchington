import { randomBytes } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { hashToken } from '@modules/token-secrets'
import { TOPIC_CLAIM_DNS_TXT_PREFIX } from './config.mts'
import type { TopicClaimWriteContext } from './require-on-topic.mts'

export interface VerificationTokenResult {
  rawToken: string
  dnsInstructions: {
    recordType: 'TXT'
    hostname: string
    value: string
  }
  wellKnownInstructions: {
    url: string
    fileContent: string
  }
}

export async function issueDomainVerificationToken(
  currentUserId: string,
  { claim, currentHostnameId, currentHostname }: TopicClaimWriteContext,
): Promise<VerificationTokenResult> {
  assert(claim.claimant_user_id === currentUserId, 404, 'Claim not found')
  assert(!claim.verified_at, 409, 'Claim is already verified')
  assert(!claim.rejected_at, 409, 'Claim has been rejected')
  assert(
    currentHostname,
    422,
    'Topic has no hostname for domain verification. Submit evidence for manual review instead.',
  )

  const rawToken = `voucha-site-verification=${randomBytes(24).toString('base64url')}`
  const tokenHash = hashToken('topic_claim_domain', rawToken)

  await write(sql`/* issueDomainVerificationToken:save */
    UPDATE topic_claims
    SET verification_token_hash = ${tokenHash},
        verification_token_issued_at = NOW(),
        verification_hostname_id = ${currentHostnameId}
    WHERE id = ${claim.id} AND claimant_user_id = ${currentUserId}
  `)

  const hostname = currentHostname
  return {
    rawToken,
    dnsInstructions: {
      recordType: 'TXT',
      hostname: `${TOPIC_CLAIM_DNS_TXT_PREFIX}.${hostname}`,
      value: rawToken,
    },
    wellKnownInstructions: {
      url: `https://${hostname}/.well-known/voucha-verification.txt`,
      fileContent: rawToken,
    },
  }
}
