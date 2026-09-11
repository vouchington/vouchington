import { randomBytes } from 'node:crypto'
import { write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { hashToken } from '@modules/token-secrets'

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
  claimId: string,
): Promise<VerificationTokenResult> {
  const { rows: claimRows } = await read(sql`/* issueDomainVerificationToken:getClaim */
    -- no-mistakes-disable-next-line postgres-required-predicates: existing claim rows on merged source topics may still issue tokens when the destination is active
    SELECT tc.id, tc.claimant_user_id, tc.topic_id, tc.verified_at, tc.rejected_at,
           COALESCE(t.hostname_id, destination_topic.hostname_id) AS hostname_id,
           uh.hostname AS verification_hostname
    FROM topic_claims tc
    LEFT JOIN topics t ON t.id = tc.topic_id
    LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
    LEFT JOIN url_hostnames uh ON uh.id = COALESCE(t.hostname_id, destination_topic.hostname_id)
    WHERE tc.id = ${claimId}
      AND t.deleted_at IS NULL
      AND (
        t.merged_into_topic_id IS NULL
        OR (
          destination_topic.deleted_at IS NULL
          AND destination_topic.merged_into_topic_id IS NULL
        )
      )
    LIMIT 1
  `)
  const claimRow = claimRows[0] as
    | {
        id: string
        claimant_user_id: string
        verified_at: Date | null
        rejected_at: Date | null
        hostname_id: string | null
        verification_hostname: string | null
      }
    | undefined
  assert(claimRow, 404, 'Claim not found')
  assert(claimRow.claimant_user_id === currentUserId, 403, 'Forbidden')
  assert(!claimRow.verified_at, 409, 'Claim is already verified')
  assert(!claimRow.rejected_at, 409, 'Claim has been rejected')
  assert(
    claimRow.verification_hostname,
    422,
    'Topic has no hostname for domain verification. Submit evidence for manual review instead.',
  )

  const rawToken = `voucha-site-verification=${randomBytes(24).toString('base64url')}`
  const tokenHash = hashToken('topic_claim_domain', rawToken)

  await write(sql`/* issueDomainVerificationToken:save */
    UPDATE topic_claims
    SET verification_token_hash = ${tokenHash},
        verification_token_issued_at = NOW(),
        verification_hostname_id = ${claimRow.hostname_id ?? null},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${claimId} AND claimant_user_id = ${currentUserId}
  `)

  const hostname = claimRow.verification_hostname
  return {
    rawToken,
    dnsInstructions: {
      recordType: 'TXT',
      hostname: `_voucha-verification.${hostname}`,
      value: rawToken,
    },
    wellKnownInstructions: {
      url: `https://${hostname}/.well-known/voucha-verification.txt`,
      fileContent: rawToken,
    },
  }
}
