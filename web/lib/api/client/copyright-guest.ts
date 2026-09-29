'use client'

import { clientApi } from './instance'

export type CopyrightGuestFilingKind = 'supplement' | 'withdrawal' | 'court_or_ccb_hold'

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
