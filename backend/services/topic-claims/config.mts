export const TOPIC_CLAIM_VERIFICATION_METHODS = [
  'dns_txt',
  'well_known_file',
  'manual_admin',
] as const
export type TopicClaimVerificationMethod = (typeof TOPIC_CLAIM_VERIFICATION_METHODS)[number]

export type TopicClaimState = 'pending' | 'verified' | 'rejected' | 'revoked'

export function getTopicClaimState(claim: {
  verified_at: Date | null
  rejected_at: Date | null
  revoked_at: Date | null
}): TopicClaimState {
  if (claim.revoked_at) return 'revoked'
  if (claim.verified_at) return 'verified'
  if (claim.rejected_at) return 'rejected'
  return 'pending'
}

export interface TopicClaim {
  id: string
  topic_id: string
  claimant_user_id: string
  verification_method: TopicClaimVerificationMethod | null
  claimed_role: string
  evidence: string
  submitted_at: Date | null
  verified_at: Date | null
  verified_by_id: string | null
  rejected_at: Date | null
  rejected_by_id: string | null
  rejection_reason: string | null
  revoked_at: Date | null
  revoked_by_id: string | null
  revocation_reason: string | null
  verification_hostname_id: string | null
  verification_token_hash: string | null
  verification_token_issued_at: Date | null
  domain_verified_at: Date | null
  created_at: Date
  updated_at: Date
}
