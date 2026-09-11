'use client'

import { clientApi } from './instance'
import type {
  RebuildBloomFilterResponse,
  CacheGroupsResponseBody,
  ClearCacheResponseBody,
  FlushConcern,
  FlushValkeyResponseBody,
} from '@/types/api-responses'

export function rebuildBloomFilter(filter: string): Promise<RebuildBloomFilterResponse> {
  return clientApi.post<RebuildBloomFilterResponse>('/api/v1/valkey/bloom-filters/rebuild', {
    filter,
  })
}

export function fetchCacheGroups(): Promise<CacheGroupsResponseBody> {
  return clientApi.get<CacheGroupsResponseBody>('/api/v1/valkey/cache-groups')
}

export function clearCache(group: string): Promise<ClearCacheResponseBody> {
  return clientApi.post<ClearCacheResponseBody>('/api/v1/valkey/caches/clear', { group })
}

export function flushValkey(
  concern: FlushConcern,
  force?: boolean,
): Promise<FlushValkeyResponseBody> {
  return clientApi.post<FlushValkeyResponseBody>(
    '/api/v1/valkey/flush',
    force ? { concern, force } : { concern },
  )
}
