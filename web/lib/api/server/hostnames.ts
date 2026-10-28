import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  HostnameDetailResponse,
  HostnameListResponse,
  HostnamesCompareResponse,
} from '@/types/hostnames'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getHostnames = cache(
  async (options: GetOptions = {}): Promise<HostnameListResponse> => {
    return serverApi.get<HostnameListResponse>('/api/v1/hostnames', options)
  },
)

export const getHostname = cache(
  async (idOrHostname: string, options?: { headers?: Record<string, string> }) => {
    return returnNullForMissingEntity(
      serverApi.get<HostnameDetailResponse>(
        `/api/v1/hostnames/${encodeURIComponent(idOrHostname)}`,
        options,
      ),
    )
  },
)

export const getHostnamesCompare = cache(
  async (ids: string[], options: GetOptions = {}): Promise<HostnamesCompareResponse> => {
    return serverApi.get<HostnamesCompareResponse>('/api/v1/hostnames/compare', {
      ...options,
      searchParams: { ...options.searchParams, ids: ids.join(',') },
    })
  },
)
