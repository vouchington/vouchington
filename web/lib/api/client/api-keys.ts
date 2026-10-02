'use client'

import { clientApi } from './instance'
import type { ApiKey } from '@/types/api-keys'
import type { ListResponse } from '@/types/api-responses'

export function getApiKeys(options?: {
  after?: string
  limit?: number
}): Promise<ListResponse<ApiKey>> {
  if (!options) return clientApi.get<ListResponse<ApiKey>>('/api/v1/my/api-keys')
  return clientApi.get<ListResponse<ApiKey>>('/api/v1/my/api-keys', { searchParams: options })
}

export function createApiKey(
  label: string,
  type: string,
  permissions: string[],
  lifetimeDays?: 30 | 90 | 365 | null,
): Promise<{ api_key: ApiKey; raw_key: string }> {
  return clientApi.post<{ api_key: ApiKey; raw_key: string }>('/api/v1/my/api-keys', {
    label,
    type,
    permissions,
    lifetime_days: lifetimeDays,
  })
}

export function revokeApiKey(id: string): Promise<void> {
  return clientApi.delete(`/api/v1/my/api-keys/${id}`)
}

export function rotateApiKey(id: string): Promise<{ api_key: ApiKey; raw_key: string }> {
  return clientApi.post(`/api/v1/my/api-keys/${id}/rotate`)
}
