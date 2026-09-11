import { cache } from 'react'
import { serverApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type { ApiKey } from '@/types/api-keys'

export const getMyApiKeys = cache(
  async (options?: {
    after?: string
    limit?: number
    headers?: Record<string, string>
  }): Promise<ListResponse<ApiKey>> =>
    serverApi.get<ListResponse<ApiKey>>('/api/v1/my/api-keys', {
      headers: options?.headers,
      searchParams: { after: options?.after, limit: options?.limit },
    }),
)
