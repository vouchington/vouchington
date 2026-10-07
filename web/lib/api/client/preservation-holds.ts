'use client'

import { clientApi } from './instance'
import { assertPathIdentifier } from './path-identifiers'
import type {
  UserPreservationHoldResponse,
  UserPreservationHoldPlacementResponse,
  UserPreservationHoldsResponse,
} from '@/types/api-responses'

function holdPath(userId: string): string {
  return `/api/v1/users/${encodeURIComponent(assertPathIdentifier(userId))}/preservation-hold`
}

export function listUserPreservationHolds(userId: string): Promise<UserPreservationHoldsResponse> {
  return clientApi.get<UserPreservationHoldsResponse>(holdPath(userId))
}

export function placeUserPreservationHold(
  userId: string,
  body: { reference: string },
): Promise<UserPreservationHoldPlacementResponse> {
  return clientApi.put<UserPreservationHoldPlacementResponse>(holdPath(userId), body)
}

export function releaseUserPreservationHold(userId: string): Promise<UserPreservationHoldResponse> {
  return clientApi.delete<UserPreservationHoldResponse>(holdPath(userId))
}
