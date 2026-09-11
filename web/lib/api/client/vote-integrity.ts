'use client'

import { clientApi } from './instance'
import { assertEncodablePathSegmentIdentifier } from './path-identifiers'
import type {
  IntegrityFlagStatusFilter,
  VoteIntegrityResolution,
} from '@ts-shared/utils/moderation-catalogs'

function encodedIntegrityPathSegment(identifier: string): string {
  return encodeURIComponent(assertEncodablePathSegmentIdentifier(identifier))
}

export function getVoteIntegrityFlagsClient<T>(params?: {
  status?: IntegrityFlagStatusFilter
  after?: string
}): Promise<T> {
  const searchParams: Record<string, string | undefined> = {}
  if (params?.status) searchParams.status = params.status
  if (params?.after) searchParams.after = params.after
  return clientApi.get<T>('/api/v1/vote-integrity/flags', { searchParams })
}

export function getVoteIntegrityPenaltiesClient<T>(params?: {
  status?: 'active' | 'revoked'
  after?: string
  sourceFlagId?: string
}): Promise<T> {
  const searchParams: Record<string, string | undefined> = { source: 'flag' }
  if (params?.status) searchParams.status = params.status
  if (params?.after) searchParams.after = params.after
  if (params?.sourceFlagId) searchParams.source_flag_id = params.sourceFlagId
  return clientApi.get<T>('/api/v1/vote-integrity/penalties', { searchParams })
}

export function getVoteIntegrityFlagClient<T>(id: string): Promise<T> {
  return clientApi.get<T>(`/api/v1/vote-integrity/flags/${encodedIntegrityPathSegment(id)}`)
}

export function getVoteIntegrityPenaltyClient<T>(id: string): Promise<T> {
  return clientApi.get<T>(`/api/v1/vote-integrity/penalties/${encodedIntegrityPathSegment(id)}`)
}

export function resolveVoteIntegrityFlag<T>(
  id: string,
  resolution: VoteIntegrityResolution,
): Promise<T> {
  return clientApi.patch<T>(`/api/v1/vote-integrity/flags/${encodedIntegrityPathSegment(id)}`, {
    resolution,
  })
}

export function applyVoteRingPenalty<T>(id: string): Promise<T> {
  return clientApi.post<T>(
    `/api/v1/vote-integrity/flags/${encodedIntegrityPathSegment(id)}/penalties`,
  )
}

export function revokeVoteWeightPenalty<T>(id: string): Promise<T> {
  return clientApi.delete<T>(`/api/v1/vote-integrity/penalties/${encodedIntegrityPathSegment(id)}`)
}
