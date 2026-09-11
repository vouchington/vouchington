'use client'

import { MODERATION_REPORT_REASON_OPTIONS } from '@ts-shared/utils/moderation-reports'
import { clientApi } from './instance'
import type {
  MemberFlatModerationReportsResponse,
  ModerationReportResolutionResponse,
  ModerationReportStatus,
  ReportableEntityType,
  ReportReason,
  RerunReportJudgementResponse,
  StaffClusteredModerationReportsResponse,
  StaffFlatModerationReportsResponse,
} from './reports-contracts'
import type { CommunityModerationReportsResponseBody } from '@/types/api-responses'

export type {
  MemberFlatModerationReportsResponse,
  MemberModerationReport,
  ModerationReportClusterIndicators,
  ModerationReportsPageInfo,
  ModerationReportResolutionResponse,
  ModerationReportStatus,
  ReportableEntityType,
  ReportReason,
  RerunReportJudgementResponse,
  StaffClusteredModerationReportsResponse,
  StaffFlatModerationReportsResponse,
  StaffModerationReport,
  StaffModerationReportCluster,
  StaffModerationReportDuplicateCluster,
} from './reports-contracts'
export interface SubmitReportResponse {
  report: {
    id: string
    status: string
    entity_type: ReportableEntityType
    entity_id: string
  }
  isDuplicate: boolean
}

export const REPORT_REASONS = MODERATION_REPORT_REASON_OPTIONS

export async function submitReport(input: {
  entityType: ReportableEntityType
  entityId: string
  reason: ReportReason
  note?: string
  cf_turnstile_response?: string
}): Promise<SubmitReportResponse> {
  return clientApi.post('/api/v1/reports', input)
}

export type ModerationReportSortParam =
  | 'severity'
  | 'most_reported'
  | 'created_at_asc'
  | 'created_at_desc'

interface ModerationReportsParams {
  status?: ModerationReportStatus
  sort?: ModerationReportSortParam
  after?: string
  limit?: number
}

type FlatModerationReportsParams = ModerationReportsParams & {
  cluster?: undefined
}

type ClusteredModerationReportsParams = ModerationReportsParams & {
  cluster: 'entity'
}

type ModerationReportsReturn<T> = T extends ClusteredModerationReportsParams
  ? StaffClusteredModerationReportsResponse
  : StaffFlatModerationReportsResponse | MemberFlatModerationReportsResponse

export function getModerationReports<
  T extends FlatModerationReportsParams | ClusteredModerationReportsParams | undefined = undefined,
>(params?: T): Promise<ModerationReportsReturn<T>> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.sort) searchParams.set('sort', params.sort)
  if (params?.after) searchParams.set('after', params.after)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.cluster) searchParams.set('cluster', params.cluster)
  const qs = searchParams.toString()
  return clientApi.get(`/api/v1/reports${qs ? `?${qs}` : ''}`)
}

export function resolveModerationReport(
  reportId: string,
  status: 'reviewed' | 'dismissed',
): Promise<ModerationReportResolutionResponse> {
  return clientApi.patch<ModerationReportResolutionResponse>(`/api/v1/reports/${reportId}`, {
    status,
  })
}

export function rerunReportJudgement(reportId: string): Promise<RerunReportJudgementResponse> {
  return clientApi.post<RerunReportJudgementResponse>(`/api/v1/reports/${reportId}/judgements`)
}

export function resolveCommunityModerationReport(
  idOrSlug: string,
  reportId: string,
  status: 'reviewed' | 'dismissed',
): Promise<void> {
  return clientApi.patch(`/api/v1/communities/${idOrSlug}/reports/${reportId}`, { status })
}

export function getCommunityPendingModerationReportsClient(
  idOrSlug: string,
  options?: { after?: string; limit?: number; sort?: ModerationReportSortParam },
): Promise<CommunityModerationReportsResponseBody> {
  return clientApi.get<CommunityModerationReportsResponseBody>(
    `/api/v1/communities/${encodeURIComponent(idOrSlug)}/reports/pending`,
    { searchParams: options },
  )
}
