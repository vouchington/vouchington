'use client'

import { clientApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type { AuthSession } from '@/types/my'
import type { Passkey } from '@/types/user'

export function continueOAuthLogin<T>(provider: string, body: unknown): Promise<T> {
  return clientApi.post<T>(`/api/v1/auth/oauth/${provider}/continue`, body)
}

export type OAuthBrokerPurpose = 'authenticate' | 'connect'

export function beginOAuthAuthorization(
  provider: 'facebook' | 'x' | 'github',
  purpose: OAuthBrokerPurpose,
): Promise<{ flow_id: string; redirect_url: string; expires_at: string }> {
  return clientApi.post(`/api/v1/auth/oauth/${provider}/authorizations`, {
    purpose,
    callback_mode: 'web',
  })
}

export function completeOAuthAuthorization<T>(flowId: string): Promise<T> {
  return clientApi.post<T>(`/api/v1/auth/oauth/authorizations/${flowId}/complete`, {})
}

export function acknowledgeOAuthAuthorization(flowId: string): Promise<void> {
  return clientApi.post(`/api/v1/auth/oauth/authorizations/${flowId}/complete`, {
    acknowledge: true,
  })
}

interface HoneypotFields {
  hp_website?: string
  hp_phone?: string
}

export function sendEmailLoginToken(
  emailAddress: string,
  cfTurnstileResponse?: string,
  honeypot?: HoneypotFields,
  uiLocale?: string,
): Promise<void> {
  return clientApi.post('/api/v1/auth/email-address/tokens', {
    email_address: emailAddress,
    cf_turnstile_response: cfTurnstileResponse,
    ui_locale: uiLocale,
    hp_website: honeypot?.hp_website ?? '',
    hp_phone: honeypot?.hp_phone ?? '',
  })
}

export function loginWithEmailAddress<T>(
  emailAddress: string,
  token: string,
  honeypot?: HoneypotFields,
): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/email-address/login', {
    email_address: emailAddress,
    token,
    hp_website: honeypot?.hp_website ?? '',
    hp_phone: honeypot?.hp_phone ?? '',
  })
}

export function postLogout(binding?: {
  web_push_endpoint: string
  web_push_subscription_id: string
}): Promise<void> {
  return binding
    ? clientApi.post('/api/v1/auth/logout', binding)
    : clientApi.post('/api/v1/auth/logout')
}

export function getPasskeyRegistrationOptions<T>(): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/passkeys/registration/options', {})
}

export function verifyPasskeyRegistration<T>(body: unknown): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/passkeys/registration/verify', body)
}

export function getPasskeysClient(options?: {
  after?: string
  limit?: number
}): Promise<ListResponse<Passkey>> {
  return clientApi.get<ListResponse<Passkey>>('/api/v1/auth/passkeys', {
    searchParams: options,
  })
}

export function renamePasskey(passkeyId: string, name: string): Promise<void> {
  return clientApi.patch(`/api/v1/auth/passkeys/${passkeyId}`, { name })
}

export function deletePasskey(passkeyId: string, reAuthToken?: string): Promise<void> {
  return clientApi.delete(`/api/v1/auth/passkeys/${passkeyId}`, {
    body: reAuthToken ? { re_auth_token: reAuthToken } : undefined,
  })
}

export function connectOAuthAccount<T>(provider: string, body: unknown): Promise<T> {
  return clientApi.put<T>(`/api/v1/auth/oauth/${provider}/connect`, body)
}

export function disconnectOAuthAccount(provider: string): Promise<void> {
  return clientApi.delete(`/api/v1/auth/oauth/${provider}/connect`)
}

// Bluesky account linking is a full-page redirect dance (AT Protocol OAuth has no client-side
// token flow), not a single request/response like connectOAuthAccount above — the caller must
// navigate to the returned redirect_url. See backend/services/bluesky-accounts/README.md.
export function beginBlueskyAccountLink(handle: string): Promise<{ redirect_url: string }> {
  return clientApi.post<{ redirect_url: string }>('/api/v1/auth/bluesky/link', { handle })
}

export function disconnectBlueskyAccount(): Promise<void> {
  return clientApi.delete('/api/v1/auth/bluesky/link')
}

export function getMfaStatusClient<T>(): Promise<T> {
  return clientApi.get<T>('/api/v1/auth/mfa/status')
}

export function getAuthSessions(options?: {
  after?: string
  limit?: number
}): Promise<ListResponse<AuthSession>> {
  return options
    ? clientApi.get<ListResponse<AuthSession>>('/api/v1/auth/sessions', {
        searchParams: options,
      })
    : clientApi.get<ListResponse<AuthSession>>('/api/v1/auth/sessions')
}

export function deleteAuthSession(sessionId: string): Promise<void> {
  return clientApi.delete(`/api/v1/auth/sessions/${sessionId}`)
}

export function revokeAuthSessions(): Promise<void> {
  return clientApi.post('/api/v1/auth/sessions/revocations')
}

// Discoverable passkey sign-in (no prior email required)
export function getDiscoverablePasskeyOptions<T>(): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/passkeys/authentication/options', {})
}

export function verifyDiscoverablePasskey<T>(response: unknown): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/passkeys/authentication/verify', {
    response,
  })
}

// MFA during login
export function verifyMfaTotp<T>(loginAttemptId: string, code: string): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/mfa/totp/verification', {
    login_attempt_id: loginAttemptId,
    code,
  })
}

export function getMfaPasskeyOptions<T>(loginAttemptId: string): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/mfa/passkeys/authentication/options', {
    login_attempt_id: loginAttemptId,
  })
}

export function verifyMfaPasskey<T>(loginAttemptId: string, response: unknown): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/mfa/passkeys/authentication/verification', {
    login_attempt_id: loginAttemptId,
    response,
  })
}

// Re-auth
export function requestReAuthEmail(): Promise<{ email_address: string }> {
  return clientApi.post<{ email_address: string }>('/api/v1/auth/mfa/re-auth/email/tokens', {})
}

export function verifyReAuthEmail<T>(code: string): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/mfa/re-auth/email/verification', {
    code,
  })
}

export function verifyReAuthTotp<T>(code: string): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/mfa/re-auth/totp/verification', {
    code,
  })
}
