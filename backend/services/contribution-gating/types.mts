import type { MembershipPlanSlug } from '@services/memberships/types'

export type ContributionGatingContext = {
  membershipPlan: MembershipPlanSlug | null
  skipAccountAgeGate?: boolean
}

export type ContributionGatingReason = 'account_too_new' | 'email_verification_required'

export type ContributionStatus = {
  allowed: boolean
  reason?: ContributionGatingReason
  gated_until?: Date
}
