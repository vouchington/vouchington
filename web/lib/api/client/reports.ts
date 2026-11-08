'use client'

import { MODERATION_REPORT_REASON_OPTIONS } from '@ts-shared/utils/moderation-reports'
import { clientApi } from './instance'
import type {
  ModerationReportResolutionResponse,
  ReportJudgementRunResponse,
  ReportableEntityType,
  ReportReason,
  RerunReportJudgementResponse,
} from './reports-contracts'
import type { CommunityModerationReportsResponseBody } from '@/types/api-responses/community-moderation'

export type {
  MemberFlatModerationReportsResponse,
  MemberModerationReport,
  ModerationReportResolutionResponse,
  ModerationReportStatus,
  ReportJudgementRunResponse,
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

export function getReportJudgementRun(
  reportId: string,
  runId: string,
): Promise<ReportJudgementRunResponse> {
  return clientApi.get<ReportJudgementRunResponse>(
    `/api/v1/reports/${reportId}/judgements/${encodeURIComponent(runId)}`,
  )
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
