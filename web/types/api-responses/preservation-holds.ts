/** An administrator-only legal-process preservation hold on a user account (issue #1449). */
export interface UserPreservationHold {
  id: string
  account_user_id: string
  /** Sensitive matter reference; shown to administrators only and never logged. */
  reference: string
  placed_by_id: string
  placed_at: string
  released_by_id: string | null
  released_at: string | null
}

export interface UserPreservationHoldsResponse {
  account_deleted_at: string | null
  holds: UserPreservationHold[]
}

export interface UserPreservationHoldResponse {
  hold: UserPreservationHold
}
