'use client'

import { clientApi } from './instance'
import type {
  FediverseProvider,
  FediverseResultType,
  FediverseSearchResponse,
} from '@/types/fediverse-search'

interface FetchFediverseSearchOptions {
  q: string
  providers?: FediverseProvider[]
  type?: FediverseResultType
  limit?: number
  after?: string
  signal?: AbortSignal
}

export function fetchFediverseSearch({
  q,
  providers,
  type,
  limit,
  after,
  signal,
}: FetchFediverseSearchOptions): Promise<FediverseSearchResponse> {
  return clientApi.get<FediverseSearchResponse>('/api/v1/fediverse/search', {
    searchParams: {
      q,
      providers: providers?.join(','),
      type,
      limit,
      after,
    },
    signal,
  })
}
