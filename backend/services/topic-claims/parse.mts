import assert from 'http-assert'

export interface CreateTopicClaimInput {
  topicId: string
  claimedRole: string
  evidence: string
}

export function parseCreateTopicClaimInput(raw: unknown): CreateTopicClaimInput {
  const body = raw as Record<string, unknown>
  assert(
    typeof body.claimed_role === 'string' && body.claimed_role.trim().length > 0,
    422,
    'claimed_role is required',
  )
  assert((body.claimed_role as string).length <= 255, 422, 'claimed_role too long')
  return {
    topicId: body.topic_id as string,
    claimedRole: (body.claimed_role as string).trim(),
    evidence: typeof body.evidence === 'string' ? body.evidence.trim() : '',
  }
}
