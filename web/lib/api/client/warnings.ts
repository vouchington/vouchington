'use client'

import { clientApi } from './instance'

export interface UserWarningItem {
  id: string
  user_id: string
  community_id: string | null
  // Absent from user-facing /my/warnings responses; present on admin responses.
  issued_by_id?: string | null
  issued_by_username?: string | null
  reason?: string
  report_id?: string | null
  public_message: string | null
  created_at: string
  community_slug: string | null
}

export interface UserWarningsResponse {
  warnings: UserWarningItem[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

export interface IssueUserWarningBody {
  userId: string
  reason: string
  publicMessage?: string | null
  reportId?: string | null
  resolveReport?: boolean
}

export interface AdminIssueUserWarningResponse {
  warning: CreatedUserWarning
}

export interface CommunityIssueUserWarningResponse {
  warning: Omit<CreatedUserWarning, 'case_id' | 'user_id'>
}

export type IssueUserWarningResponse =
  | AdminIssueUserWarningResponse
  | CommunityIssueUserWarningResponse

export interface CreatedUserWarning {
  id: string
  case_id: string
  user_id: string
  community_id: string | null
  issued_by_id: string | null
  reason: string
  public_message: string | null
  report_id: string | null
  revoked_at: string | null
  revoked_by_id: string | null
  created_at: string
}

export async function issueAdminUserWarning(
  body: IssueUserWarningBody,
): Promise<AdminIssueUserWarningResponse> {
  assertWarningTextLimits(body)
  const requestBody = {
    userId: body.userId,
    reason: body.reason,
    publicMessage: body.publicMessage,
    reportId: body.reportId,
    ...(body.reportId ? { resolveReport: true } : {}),
  }
  return clientApi.post<AdminIssueUserWarningResponse>('/api/v1/admin/warnings', requestBody)
}

export async function issueCommunityUserWarning(
  communitySlug: string,
  body: IssueUserWarningBody,
): Promise<CommunityIssueUserWarningResponse> {
  assertWarningTextLimits(body)
  return clientApi.post<CommunityIssueUserWarningResponse>(
    `/api/v1/communities/${encodeURIComponent(communitySlug)}/warnings`,
    body,
  )
}

function assertWarningTextLimits(body: IssueUserWarningBody): void {
  if (body.reason.length > 1000)
    throw new RangeError('Warning reason must be 1000 characters or less')
  if ((body.publicMessage?.length ?? 0) > 2000) {
    throw new RangeError('Public warning message must be 2000 characters or less')
  }
}

export function getMyWarningsClient(params?: {
  after?: string | null
  limit?: number
}): Promise<UserWarningsResponse> {
  const searchParams = new URLSearchParams()
  if (params?.after) searchParams.set('after', params.after)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return clientApi.get<UserWarningsResponse>(`/api/v1/my/warnings${qs ? `?${qs}` : ''}`)
}

export function getAdminUserWarnings(params: {
  userId: string
  after?: string | null
  limit?: number
}): Promise<UserWarningsResponse> {
  const searchParams = new URLSearchParams({ userId: params.userId })
  if (params.after) searchParams.set('after', params.after)
  if (params.limit) searchParams.set('limit', String(params.limit))
  return clientApi.get<UserWarningsResponse>(`/api/v1/admin/warnings?${searchParams.toString()}`)
}
