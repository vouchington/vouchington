'use client'

import { clientApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type { TotpAuthenticator } from '@/types/user'

export function setupTotp<T>(body: { name?: string }): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/totp', body)
}

export function verifyTotpSetup<T>(body: { authenticator_id: string; code: string }): Promise<T> {
  return clientApi.post<T>('/api/v1/auth/totp/setup/verification', body)
}

export function getTotpAuthenticatorsClient(options?: {
  after?: string
  limit?: number
}): Promise<ListResponse<TotpAuthenticator>> {
  return clientApi.get<ListResponse<TotpAuthenticator>>('/api/v1/auth/totp', {
    searchParams: options,
  })
}

export function renameTotpAuthenticator(id: string, name: string): Promise<void> {
  return clientApi.patch(`/api/v1/auth/totp/${id}`, { name })
}

export function deleteTotpAuthenticator(id: string, reAuthToken?: string): Promise<void> {
  return clientApi.delete(`/api/v1/auth/totp/${id}`, {
    body: reAuthToken ? { re_auth_token: reAuthToken } : undefined,
  })
}
