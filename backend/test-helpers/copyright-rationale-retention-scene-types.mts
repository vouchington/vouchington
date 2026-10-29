type Jurisdiction = 'eu_dsa' | 'uk'

export type CopyrightRationaleRetentionProbe = {
  createCase: (jurisdiction: Jurisdiction) => Promise<{
    noticeId: string
    claimantId: string
    rationaleId: string
  }>
  createReview: () => Promise<{
    rationaleId: string
    reviewIdentityId: string
    reviewEventId: string
  }>
  createAccountTermination: () => Promise<{ accountId: string; rationaleId: string }>
  hold: (accountId: string) => Promise<string>
  release: (holdId: string) => Promise<void>
  eligible: (rationaleId: string) => Promise<boolean>
  deleteEligible: (rationaleId: string) => Promise<number>
  caseResult: (noticeId: string) => Promise<{ outcome: string; rationale: string }>
  accountResult: (accountId: string) => Promise<{
    outcome: string
    currentRationale: string
    effectiveRationale: string
  }>
}
