'use client'

import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import type { OAuthProvider } from '@/types/user'
import { clientApi } from './instance'

export type ReAuthMethods = {
  has_email: boolean
  has_totp: boolean
  has_passkey: boolean
  providers: OAuthProvider[]
}
export type ReAuthProof = { re_auth_token: string }
export type ReAuthAuthorization = { flow_id: string; redirect_url: string; expires_at: string }

export function getReAuthMethods(): Promise<ReAuthMethods> {
  return clientApi.get('/api/v1/auth/re-auth/methods')
}

export function getPasskeyReAuthOptions(passkeyId: string): Promise<{
  flow_id: string
  options: PublicKeyCredentialRequestOptionsJSON
}> {
  return clientApi.post('/api/v1/auth/re-auth/passkeys/options', { passkey_id: passkeyId })
}

export function verifyPasskeyReAuth(
  passkeyId: string,
  flowId: string,
  response: unknown,
): Promise<ReAuthProof> {
  return clientApi.post('/api/v1/auth/re-auth/passkeys/verification', {
    passkey_id: passkeyId,
    flow_id: flowId,
    response,
  })
}

export function beginSdkProviderReAuth(provider: 'apple' | 'google'): Promise<{
  flow_id: string
  nonce: string
  expires_at: string
}> {
  return clientApi.post(`/api/v1/auth/re-auth/providers/${provider}/challenges`)
}

export function verifySdkProviderReAuth(
  provider: 'apple' | 'google',
  flowId: string,
  credential: string,
): Promise<ReAuthProof> {
  return clientApi.post(`/api/v1/auth/re-auth/providers/${provider}/verification`, {
    flow_id: flowId,
    credential,
  })
}

export function beginBrokerProviderReAuth(
  provider: Exclude<OAuthProvider, 'apple' | 'google'>,
): Promise<ReAuthAuthorization> {
  return clientApi.post(`/api/v1/auth/re-auth/providers/${provider}/authorizations`, {
    callback_mode: 'web',
  })
}

export function retrieveBrokerProviderReAuthProof(
  provider: Exclude<OAuthProvider, 'apple' | 'google'>,
  flowId: string,
): Promise<ReAuthProof> {
  return clientApi.post(`/api/v1/auth/re-auth/providers/${provider}/proofs`, { flow_id: flowId })
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
