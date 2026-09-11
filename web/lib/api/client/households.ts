'use client'

import { clientApi } from './instance'
import { assertEncodablePathSegmentIdentifier } from './path-identifiers'
import type { HouseholdResponseBody, ListResponse } from '@/types/api-responses'
import type { Household, HouseholdListOptions, HouseholdMembership } from '@/types/my'

export function createHousehold(body: unknown = {}): Promise<HouseholdResponseBody> {
  return clientApi.post<HouseholdResponseBody>('/api/v1/households', body)
}

export function getHouseholdsClient(
  options: HouseholdListOptions = {},
): Promise<ListResponse<Household>> {
  return clientApi.get<ListResponse<Household>>('/api/v1/households', {
    searchParams: { ...options },
  })
}

export function getHouseholdMembershipsClient(
  householdId: string,
  options: { after?: string; limit?: number } = {},
): Promise<ListResponse<HouseholdMembership>> {
  const safeHouseholdId = assertEncodablePathSegmentIdentifier(householdId)
  return clientApi.get<ListResponse<HouseholdMembership>>(
    `/api/v1/households/${encodeURIComponent(safeHouseholdId)}/memberships`,
    { searchParams: options },
  )
}

export function removeHouseholdMembership(
  householdId: string,
  membershipId: string,
): Promise<void> {
  const safeHouseholdId = assertEncodablePathSegmentIdentifier(householdId)
  const safeMembershipId = assertEncodablePathSegmentIdentifier(membershipId)
  return clientApi.delete(
    `/api/v1/households/${encodeURIComponent(safeHouseholdId)}/memberships/${encodeURIComponent(safeMembershipId)}`,
  )
}
