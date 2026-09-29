'use client'

import { clientApi } from './instance'

export type CopyrightGuestFilingKind = 'supplement' | 'withdrawal' | 'court_or_ccb_hold'

export type CopyrightGuestCapabilitySummary = {
  id: string
  issued_at: string
  issued_by_id: string | null
  issued_by_username: string | null
  expires_at: string
  revoked_at: string | null
}

export type CopyrightGuestCapabilitiesPage = {
  copyright_guest_capabilities: CopyrightGuestCapabilitySummary[]
  page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

export function listCopyrightGuestCapabilities(
  noticeId: string,
  options?: { after?: string; limit?: number },
): Promise<CopyrightGuestCapabilitiesPage> {
  return clientApi.get(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`, {
    searchParams: { after: options?.after, limit: options?.limit },
  })
}

export function issueCopyrightGuestCapability(
  noticeId: string,
  expiresAt: string,
): Promise<{ copyright_guest_capability: { id: string; expires_at: string; token: string } }> {
  return clientApi.post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`, {
    expires_at: expiresAt,
  })
}

export function revokeCopyrightGuestCapability(
  noticeId: string,
  capabilityId: string,
): Promise<{ copyright_guest_capability: { id: string; revoked_at: string } }> {
  return clientApi.post(
    `/api/v1/copyright-notices/${noticeId}/guest-capabilities/${capabilityId}/revocation`,
  )
}

export function requestCopyrightGuestInformation(
  noticeId: string,
  capabilityId: string,
  statement: string,
): Promise<{ copyright_correspondence: { id: string } }> {
  return clientApi.post(
    `/api/v1/copyright-notices/${noticeId}/guest-capabilities/${capabilityId}/information-requests`,
    { statement },
  )
}

export function submitCopyrightGuestFiling(input: {
  noticeId: string
  token: string
  kind: CopyrightGuestFilingKind
  statement: string
  cf_turnstile_response?: string
}): Promise<{
  copyright_submission: { id: string; kind: CopyrightGuestFilingKind; received_at: string }
}> {
  return clientApi.post(
    `/api/v1/copyright-notices/${input.noticeId}/guest-filings`,
    {
      kind: input.kind,
      statement: input.statement,
      cf_turnstile_response: input.cf_turnstile_response,
    },
    { headers: { 'Copyright-Guest-Capability': input.token } },
  )
}
