'use client'

import { clientApi } from './instance'
import { assertEncodablePathSegmentIdentifier } from './path-identifiers'
import type { ListResponse } from '@/types/api-responses'
import type { HouseholdInvitation } from '@/types/household-invitations'
import type { HouseholdMembership } from '@/types/my'

type PageOptions = { after?: string; limit?: number }
export type HouseholdInvitationResponse = { invitation: HouseholdInvitation }
export type HouseholdInvitationAcceptanceResponse = { membership: HouseholdMembership }

function segment(value: string) {
  return encodeURIComponent(assertEncodablePathSegmentIdentifier(value))
}

export function getHouseholdInvitationsClient(householdId: string, options: PageOptions = {}) {
  return clientApi.get<ListResponse<HouseholdInvitation>>(
    `/api/v1/households/${segment(householdId)}/invitations`,
    { searchParams: options },
  )
}

export function getMyHouseholdInvitationsClient(options: PageOptions = {}) {
  return clientApi.get<ListResponse<HouseholdInvitation>>('/api/v1/my/household-invitations', {
    searchParams: options,
  })
}

export function createHouseholdInvitation(
  householdId: string,
  body: { user: string; relationship?: string },
) {
  return clientApi.post<HouseholdInvitationResponse>(
    `/api/v1/households/${segment(householdId)}/invitations`,
    body,
  )
}

export function revokeHouseholdInvitation(
  householdId: string,
  invitationId: string,
): Promise<void> {
  return clientApi.delete(
    `/api/v1/households/${segment(householdId)}/invitations/${segment(invitationId)}`,
  )
}

export function acceptHouseholdInvitation(invitationId: string) {
  return clientApi.post<HouseholdInvitationAcceptanceResponse>(
    `/api/v1/my/household-invitations/${segment(invitationId)}/acceptance`,
    {},
  )
}

export function declineHouseholdInvitation(invitationId: string): Promise<void> {
  return clientApi.post<void>(
    `/api/v1/my/household-invitations/${segment(invitationId)}/decline`,
    {},
  )
}
