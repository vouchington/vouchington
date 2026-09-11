import { cache } from 'react'
import { serverApi } from './instance'
import type {
  MemberFlatModerationReportsResponse,
  StaffClusteredModerationReportsResponse,
  StaffFlatModerationReportsResponse,
} from '../client/reports-contracts'
import type {
  CommunityModerationReportsResponse,
  ServerClusteredModerationReportsResponse,
  ServerGetModerationReportsOptions,
  ServerModerationReportsResponse,
} from '../../moderation-report-types'
export type {
  CommunityModerationReport,
  CommunityModerationReportsResponse,
  ModerationReport,
  ModerationReportCluster,
  ModerationReportDuplicateCluster,
  ServerModerationReportClusterIndicators,
  ServerModerationReportReasonBreakdown,
} from '../../moderation-report-types'

const getPendingModerationReportsCached = cache(
  async <
    TResponse extends ServerModerationReportsResponse | ServerClusteredModerationReportsResponse,
  >(
    options: ServerGetModerationReportsOptions = {},
  ): Promise<TResponse> => {
    return serverApi.get<TResponse>('/api/v1/reports', options)
  },
)

export function getPendingModerationReports(
  options: ServerGetModerationReportsOptions = {},
): Promise<ServerModerationReportsResponse | ServerClusteredModerationReportsResponse> {
  return getPendingModerationReportsCached<
    ServerModerationReportsResponse | ServerClusteredModerationReportsResponse
  >(options)
}

export function getStaffPendingModerationReports(
  options: ServerGetModerationReportsOptions = {},
): Promise<StaffFlatModerationReportsResponse | StaffClusteredModerationReportsResponse> {
  return getPendingModerationReportsCached<
    StaffFlatModerationReportsResponse | StaffClusteredModerationReportsResponse
  >(options)
}

export function getMemberPendingModerationReports(
  options: ServerGetModerationReportsOptions = {},
): Promise<MemberFlatModerationReportsResponse> {
  return getPendingModerationReportsCached<MemberFlatModerationReportsResponse>(options)
}

export const getCommunityPendingModerationReports = cache(
  async (
    idOrSlug: string,
    options: ServerGetModerationReportsOptions = {},
  ): Promise<CommunityModerationReportsResponse> => {
    return serverApi.get<CommunityModerationReportsResponse>(
      `/api/v1/communities/${idOrSlug}/reports/pending`,
      options,
    )
  },
)
