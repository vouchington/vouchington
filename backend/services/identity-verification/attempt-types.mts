export type IdentityVerificationAttempt = {
  id: string
  source: 'self_paid' | 'membership_included' | 'support_grant'
  amountMinorUnits: number
}
