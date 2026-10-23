import type { HouseholdInvitation, HouseholdInvitationPage } from '@/types/household-invitations'
import type { ListResponse } from '@/types/api-responses'

export function makeHouseholdInvitation(
  overrides: Partial<HouseholdInvitation> = {},
): HouseholdInvitation {
  const invitedUserId = overrides.invited_user_id ?? '00000000-0000-7000-8000-000000000201'
  const invitedById = overrides.invited_by_id ?? '00000000-0000-7000-8000-000000000202'
  return {
    id: '00000000-0000-7000-8000-000000000301',
    household_id: '00000000-0000-7000-8000-000000000101',
    invited_user_id: invitedUserId,
    invited_by_id: invitedById,
    invited_user: { id: invitedUserId, username: 'alex' },
    invited_by: { id: invitedById, username: 'owner' },
    household_owner: { id: invitedById, username: 'owner' },
    relationship: 'Family',
    accepted_at: null,
    declined_at: null,
    revoked_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

export function makeHouseholdInvitationList(
  invitations = [makeHouseholdInvitation()],
): ListResponse<HouseholdInvitation> {
  return {
    results: invitations,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}

export function makeHouseholdInvitationPage(
  invitations = [makeHouseholdInvitation()],
): HouseholdInvitationPage {
  const page = makeHouseholdInvitationList(invitations)
  return { invitations: page.results, pageInfo: page.page_info, loadError: false }
}
