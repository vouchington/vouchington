'use client'

import { clientApi } from './instance'
import type {
  PrioritizedReferralLinksResponse,
  UserReferralLinkWithDetails,
  ListResponse,
} from '@/types/api-responses'

interface CreateReferralLinkInput {
  referral_program_id: string
  url: string
  label: string | null
}

interface UpdateReferralLinkInput {
  label: string | null
}

interface ReferralLinkActivationResponse {
  referral_link: {
    id: string
    activated_at: string | null
    deactivated_at: string | null
  }
}

interface ReferralLinkUnfurlResponse {
  referral_link: {
    id: string
    parent_link_id: string | null
    unfurl_requested_at: string | null
    unfurl_completed_at: string | null
    unfurl_failed_at: string | null
    unfurl_last_error: string | null
  }
}

export function createReferralLink(input: CreateReferralLinkInput): Promise<void> {
  return clientApi.post('/api/v1/referral-links', input)
}

export function updateReferralLink(id: string, input: UpdateReferralLinkInput): Promise<void> {
  return clientApi.patch(`/api/v1/referral-links/${id}`, input)
}

export function deleteReferralLink(id: string): Promise<void> {
  return clientApi.delete(`/api/v1/referral-links/${id}`)
}

export function activateReferralLink(id: string): Promise<ReferralLinkActivationResponse> {
  return clientApi.post<ReferralLinkActivationResponse>(
    `/api/v1/referral-links/${id}/activations`,
    {},
  )
}

export function deactivateReferralLink(id: string): Promise<ReferralLinkActivationResponse> {
  return clientApi.delete<ReferralLinkActivationResponse>(
    `/api/v1/referral-links/${id}/activations`,
  )
}

export function unfurlReferralLink(id: string): Promise<ReferralLinkUnfurlResponse> {
  return clientApi.post<ReferralLinkUnfurlResponse>(`/api/v1/referral-links/${id}/unfurls`, {})
}

export function getMyReferralLinksClient(
  after?: string,
): Promise<ListResponse<UserReferralLinkWithDetails>> {
  return clientApi.get<ListResponse<UserReferralLinkWithDetails>>('/api/v1/referral-links', {
    searchParams: after ? { after } : undefined,
  })
}

export function getAllReferralLinks(
  referralProgramId: string,
): Promise<PrioritizedReferralLinksResponse> {
  return clientApi.get<PrioritizedReferralLinksResponse>(
    `/api/v1/topics/${referralProgramId}/prioritized-referral-links`,
    { searchParams: { all: true } },
  )
}
