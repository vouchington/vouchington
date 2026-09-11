'use client'

import { clientApi } from './instance'
import { assertEncodablePathSegmentIdentifier } from './path-identifiers'
import type {
  IntegrityFlagStatusFilter,
  ReportIntegrityPatchResolution,
} from '@ts-shared/utils/moderation-catalogs'

function encodedIntegrityPathSegment(identifier: string): string {
  return encodeURIComponent(assertEncodablePathSegmentIdentifier(identifier))
}

export function getReportIntegrityFlagsClient<T>(params?: {
  status?: IntegrityFlagStatusFilter
  after?: string
}): Promise<T> {
  const searchParams: Record<string, string | undefined> = {}
  if (params?.status) searchParams.status = params.status
  if (params?.after) searchParams.after = params.after
  return clientApi.get<T>('/api/v1/report-integrity/flags', { searchParams })
}

export function getReportIntegrityPenaltiesClient<T>(params?: {
  status?: 'active' | 'revoked'
  after?: string
}): Promise<T> {
  const searchParams: Record<string, string | undefined> = {}
  if (params?.status) searchParams.status = params.status
  if (params?.after) searchParams.after = params.after
  return clientApi.get<T>('/api/v1/report-integrity/penalties', { searchParams })
}

export function getReportIntegrityFlagClient<T>(id: string): Promise<T> {
  return clientApi.get<T>(`/api/v1/report-integrity/flags/${encodedIntegrityPathSegment(id)}`)
}

export function getReportIntegrityPenaltyClient<T>(id: string): Promise<T> {
  return clientApi.get<T>(`/api/v1/report-integrity/penalties/${encodedIntegrityPathSegment(id)}`)
}

export function resolveReportIntegrityFlag<T>(
  id: string,
  resolution: ReportIntegrityPatchResolution,
): Promise<T> {
  return clientApi.patch<T>(`/api/v1/report-integrity/flags/${encodedIntegrityPathSegment(id)}`, {
    resolution,
  })
}

export function applyReportAbusePenalty<T>(flagId: string): Promise<T> {
  return clientApi.post<T>(
    `/api/v1/report-integrity/flags/${encodedIntegrityPathSegment(flagId)}/penalties`,
  )
}

export function revokeReportAbusePenalty<T>(penaltyId: string): Promise<T> {
  return clientApi.delete<T>(
    `/api/v1/report-integrity/penalties/${encodedIntegrityPathSegment(penaltyId)}`,
  )
}
