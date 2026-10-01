export type LockedCopyrightActionDelivery = {
  lease_token: string
  copyright_notice_id: string
  copyright_restriction_id: string
  placement_id: string
  image_id: string
  expected_placement_revision: number
  action: 'withhold' | 'restore'
  copyright_notice_deadline_id: string | null
  restriction_lifted_at: Date | null
  human_reviewed_at: Date | null
  human_review_action: 'confirm' | 'reverse' | null
  reversal_authorized: boolean
  hold_resolution_authorized: boolean
  earliest_restoration_at: Date | null
  resolved_at: Date | null
  cancelled_at: Date | null
}
