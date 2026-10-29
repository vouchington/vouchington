import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { TopicClaim } from './config.mts'
import { assertTopicClaimEvidenceWithinLimit } from './parse.mts'
import type { TopicClaimWriteContext } from './require-on-topic.mts'
import { getTopicClaimById } from './get.mts'

export async function submitTopicClaimForManualReview(
  currentUserId: string,
  { claim }: TopicClaimWriteContext,
  evidence: string,
): Promise<TopicClaim> {
  assert(claim.claimant_user_id === currentUserId, 404, 'Claim not found')
  assert(!claim.verified_at && !claim.rejected_at, 404, 'Claim not found or already resolved')
  const trimmedEvidence = evidence.trim()
  assert(trimmedEvidence.length > 0, 422, 'evidence is required for manual review')
  assertTopicClaimEvidenceWithinLimit(trimmedEvidence)
  const { rows } = await write(sql`/* submitTopicClaimForManualReview */
    UPDATE topic_claims
    SET submitted_at = NOW(),
        evidence = ${trimmedEvidence}
    WHERE id = ${claim.id}
      AND claimant_user_id = ${currentUserId}
      AND verified_at IS NULL
      AND rejected_at IS NULL
    RETURNING id
  `)
  const updated = rows[0] && (await getTopicClaimById(claim.id, write))
  assert(updated, 404, 'Claim not found or already resolved')
  return updated
}
