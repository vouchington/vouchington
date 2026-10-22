import type { PageInfo } from '@/types/api-responses'

export interface HouseholdInvitation {
  id: string
  household_id: string
  invited_user_id: string
  invited_by_id: string
  invited_user: { id: string; username: string | null }
  invited_by: { id: string; username: string | null }
  household_owner: { id: string; username: string | null }
  relationship: string | null
  accepted_at: string | null
  declined_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

/** Page-one display state, keeping a failed load distinct from an empty list. */
export interface HouseholdInvitationPage {
  invitations: HouseholdInvitation[]
  pageInfo: PageInfo
  loadError: boolean
}
