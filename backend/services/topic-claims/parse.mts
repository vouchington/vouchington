import assert from 'http-assert'

/** Matches the create and manual-review request contracts. */
export const TOPIC_CLAIM_EVIDENCE_MAX_LENGTH = 10_000

export interface CreateTopicClaimInput {
  topicId: string
  claimedRole: string
  evidence: string
}

export function assertTopicClaimEvidenceWithinLimit(evidence: string): void {
  assert(evidence.length <= TOPIC_CLAIM_EVIDENCE_MAX_LENGTH, 422, 'evidence too long')
}

export function parseCreateTopicClaimInput(raw: unknown): CreateTopicClaimInput {
  const body = raw as Record<string, unknown>
  assert(
    typeof body.claimed_role === 'string' && body.claimed_role.trim().length > 0,
    422,
    'claimed_role is required',
  )
  assert((body.claimed_role as string).length <= 255, 422, 'claimed_role too long')
  const evidence = typeof body.evidence === 'string' ? body.evidence.trim() : ''
  assertTopicClaimEvidenceWithinLimit(evidence)
  return {
    topicId: body.topic_id as string,
    claimedRole: (body.claimed_role as string).trim(),
    evidence,
  }
}
