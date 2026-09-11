export type TopicClaimVerificationMethod = 'dns_txt' | 'well_known_file' | 'manual_admin'
export type TopicClaimState = 'pending' | 'verified' | 'rejected' | 'revoked'

export interface TopicClaim {
  id: string
  topic_id: string
  claimant_user_id: string
  verification_method: TopicClaimVerificationMethod | null
  claimed_role: string
  evidence: string
  submitted_at: string | null
  verified_at: string | null
  verified_by_id: string | null
  rejected_at: string | null
  rejected_by_id: string | null
  rejection_reason: string | null
  revoked_at: string | null
  revoked_by_id: string | null
  revocation_reason: string | null
  verification_hostname_id: string | null
  verification_token_hash: string | null
  verification_token_issued_at: string | null
  domain_verified_at: string | null
  created_at: string
  updated_at: string
}

export function getTopicClaimState(
  claim: Pick<TopicClaim, 'verified_at' | 'rejected_at' | 'revoked_at'>,
): TopicClaimState {
  if (claim.revoked_at) return 'revoked'
  if (claim.verified_at) return 'verified'
  if (claim.rejected_at) return 'rejected'
  return 'pending'
}
