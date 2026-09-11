'use client'

import { clientApi } from './instance'
import type { IdentityVerificationResponseBody } from '@/types/api-responses'
import type { PublicVerifiedNameDisplay } from '@/types/user'

export function startMyIdentityVerificationCheckout(): Promise<{ url: string }> {
  return clientApi.post<{ url: string }>('/api/v1/my/identity-verification/checkout-sessions', {})
}

export function updateMyIdentityVerificationDisplayPreferences(body: {
  verified_badge_visible?: boolean
  public_verified_name_display?: PublicVerifiedNameDisplay
}): Promise<IdentityVerificationResponseBody> {
  return clientApi.patch<IdentityVerificationResponseBody>(
    '/api/v1/my/identity-verification/display-preferences',
    body,
  )
}

export function getMyIdentityVerificationSessionUrl(): Promise<{ url: string }> {
  return clientApi.get<{ url: string }>('/api/v1/my/identity-verification/session-url')
}

export function grantIdentityVerificationAttempt(
  userId: string,
  note: string,
): Promise<{ granted: true }> {
  return clientApi.post<{ granted: true }>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/identity-verification-attempts`,
    { note },
  )
}
