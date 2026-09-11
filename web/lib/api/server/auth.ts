import { cache } from 'react'
import { serverApi } from './instance'
import type { AuthMeResponseBody, ListResponse } from '@/types/api-responses'
import type { MfaStatus, Passkey, TotpAuthenticator } from '@/types/user'
import type { AuthSession } from '@/types/my'

export const getAuthMe = cache(
  async (options?: { headers?: Record<string, string> }): Promise<AuthMeResponseBody> => {
    return serverApi.get<AuthMeResponseBody>('/api/v1/auth/me', options)
  },
)

export const getPasskeys = cache(
  async (options?: {
    after?: string
    limit?: number
    headers?: Record<string, string>
  }): Promise<ListResponse<Passkey>> => {
    return serverApi.get<ListResponse<Passkey>>(
      '/api/v1/auth/passkeys',
      options
        ? {
            headers: options.headers,
            searchParams: { after: options.after, limit: options.limit },
          }
        : undefined,
    )
  },
)

export const getTotpAuthenticators = cache(
  async (options?: {
    after?: string
    limit?: number
    headers?: Record<string, string>
  }): Promise<ListResponse<TotpAuthenticator>> => {
    return serverApi.get<ListResponse<TotpAuthenticator>>(
      '/api/v1/auth/totp',
      options
        ? {
            headers: options.headers,
            searchParams: { after: options.after, limit: options.limit },
          }
        : undefined,
    )
  },
)

export const getMfaStatus = cache(
  async (options?: { headers?: Record<string, string> }): Promise<MfaStatus> => {
    return serverApi.get<MfaStatus>('/api/v1/auth/mfa/status', options)
  },
)

export const getAuthSessionsServer = cache(
  async (options?: {
    after?: string
    limit?: number
    headers?: Record<string, string>
  }): Promise<ListResponse<AuthSession>> => {
    return serverApi.get<ListResponse<AuthSession>>(
      '/api/v1/auth/sessions',
      options
        ? {
            headers: options.headers,
            searchParams: { after: options.after, limit: options.limit },
          }
        : undefined,
    )
  },
)
