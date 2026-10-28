import { cache } from 'react'
import { serverApi } from './instance'
import type {
  MemberFlatModerationReportsResponse,
  StaffClusteredModerationReportsResponse,
  StaffFlatModerationReportsResponse,
  StaffModerationReport,
} from '../client/reports-contracts'
import type { CommunityBanEvasionContext } from '@/types/api-responses'

type CommunityModerationReport = Omit<
  StaffModerationReport,
  'entity_type' | 'reporter_user_id' | 'reporter_username'
> & {
  entity_type: 'post' | 'comment' | 'user'
  community_ban_evasion?: CommunityBanEvasionContext | null
}

interface CommunityModerationReportsResponse {
  reports: CommunityModerationReport[]
  page_info?: import('@/types/api-responses').PageInfo
}

type ServerModerationReportsResponse =
  | StaffFlatModerationReportsResponse
  | MemberFlatModerationReportsResponse
type ServerClusteredModerationReportsResponse = StaffClusteredModerationReportsResponse

interface ServerGetModerationReportsOptions {
  searchParams?: {
    limit?: number
    after?: string
    before?: string
    status?: string
    sort?: 'severity' | 'most_reported' | 'created_at_asc' | 'created_at_desc'
    cluster?: 'entity'
  }
  headers?: Record<string, string>
}

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
