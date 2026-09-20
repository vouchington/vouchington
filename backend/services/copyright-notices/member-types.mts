import type { CopyrightHumanReviewAction, CopyrightJurisdiction } from './types.mts'

export type MemberCopyrightNotice = {
  id: string
  jurisdiction: CopyrightJurisdiction
  received_at: Date
  accepted_at: Date
  target_reference: string | null
  claimant: { user_id: string; display_name: string | null } | null
  allegation_label: 'copyright allegation'
  review_outcome: CopyrightHumanReviewAction | null
  restriction_label:
    | 'no restriction recorded'
    | 'provisionally withheld pending human review'
    | 'restriction active'
}
