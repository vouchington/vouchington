'use client'

import { clientApi } from './instance'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { CopyrightTerritorialJurisdiction } from './copyright-territorial-decisions'

export type CopyrightTerritorialComplaint = NonNullable<
  NonNullable<CopyrightStaffQueueItem['territorial']>['complaints']
>[number]
export type CopyrightEuDisputeSettlement = NonNullable<
  NonNullable<CopyrightStaffQueueItem['territorial']>['dispute_settlements']
>[number]
export type CopyrightTerritorialStaffPageInfo = {
  has_next_page: boolean
  start_cursor: string | null
  end_cursor: string | null
}
export type CopyrightTerritorialComplaintsPage = {
  copyright_territorial_complaints: CopyrightTerritorialComplaint[]
  page_info: CopyrightTerritorialStaffPageInfo
}
export type CopyrightEuDisputeSettlementsPage = {
  copyright_eu_dispute_settlements: CopyrightEuDisputeSettlement[]
  page_info: CopyrightTerritorialStaffPageInfo
}
export type CopyrightEuDisputeSettlementResult =
  | 'decided_for_recipient'
  | 'decided_for_platform'
  | 'withdrawn'
  | 'no_decision'

function noticePath(jurisdiction: CopyrightTerritorialJurisdiction, noticeId: string): string {
  const route = jurisdiction === 'eu_dsa' ? 'copyright-eu-notices' : 'copyright-uk-notices'
  return `/api/v1/${route}/${noticeId}`
}

export function listCopyrightTerritorialComplaints(
  noticeId: string,
  options: { after?: string } = {},
): Promise<CopyrightTerritorialComplaintsPage> {
  return clientApi.get(`/api/v1/copyright-notices/${noticeId}/territorial-complaints`, {
    searchParams: { after: options.after },
  })
}

export function listCopyrightEuStaffDisputeSettlements(
  noticeId: string,
  options: { after?: string } = {},
): Promise<CopyrightEuDisputeSettlementsPage> {
  return clientApi.get(`/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements/staff`, {
    searchParams: { after: options.after },
  })
}

export function decideCopyrightTerritorialRedress(
  jurisdiction: CopyrightTerritorialJurisdiction,
  noticeId: string,
  redressId: string,
  input: { staff_disposition: 'maintain' | 'revoke'; rationale: string },
): Promise<unknown> {
  return clientApi.post(
    `${noticePath(jurisdiction, noticeId)}/redress-requests/${redressId}/decisions`,
    input,
  )
}

export function referCopyrightEuDisputeSettlement(
  noticeId: string,
  input: {
    body_name: string
    referred_at: string
    referred_by_party: 'poster' | 'notifier'
    referred_by_id?: string
  },
): Promise<unknown> {
  return clientApi.post(`${noticePath('eu_dsa', noticeId)}/dispute-settlements`, input)
}

export function recordCopyrightEuDisputeSettlementOutcome(
  noticeId: string,
  referralId: string,
  input: { result: CopyrightEuDisputeSettlementResult; decided_at: string },
): Promise<unknown> {
  return clientApi.post(
    `${noticePath('eu_dsa', noticeId)}/dispute-settlements/${referralId}/outcomes`,
    input,
  )
}

export function recordCopyrightEuDisputeSettlementImplementation(
  noticeId: string,
  referralId: string,
  input: { implemented_at: string },
): Promise<unknown> {
  return clientApi.post(
    `${noticePath('eu_dsa', noticeId)}/dispute-settlements/${referralId}/implementations`,
    input,
  )
}
