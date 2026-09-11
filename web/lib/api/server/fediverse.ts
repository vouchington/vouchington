import { cache } from 'react'
import { serverApi } from './instance'
import type {
  FediverseProvider,
  FediverseResultType,
  FediverseSearchResponse,
} from '@/types/fediverse-search'
import type {
  FediverseInstanceResponse,
  FediverseInstancesResponse,
} from '@/types/fediverse-instances'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import {
  isCurrentFediverseInstancesResponse,
  normalizeFediverseInstanceResponse,
  normalizeFediverseInstancesResponse,
} from '../fediverse-instances-normalization'
import { getTopics } from './topics'

interface GetFediverseSearchOptions {
  q: string
  providers?: FediverseProvider[]
  type?: FediverseResultType
  limit?: number
  after?: string
}

export const getFediverseSearch = cache(
  async ({
    q,
    providers,
    type,
    limit,
    after,
  }: GetFediverseSearchOptions): Promise<FediverseSearchResponse> => {
    return serverApi.get<FediverseSearchResponse>('/api/v1/fediverse/search', {
      searchParams: {
        q,
        providers: providers?.join(','),
        type,
        limit,
        after,
      },
    })
  },
)

interface GetFediverseInstancesOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
}

export interface FediverseInstancesLoadResult {
  data: FediverseInstancesResponse
  usesDedicatedEndpoint: boolean
}

export const getFediverseInstances = cache(
  async (options: GetFediverseInstancesOptions = {}): Promise<FediverseInstancesLoadResult> => {
    const response = await serverApi.get<unknown>('/api/v1/fediverse/instances', options)
    if (isCurrentFediverseInstancesResponse(response)) {
      return { data: normalizeFediverseInstancesResponse(response), usesDedicatedEndpoint: true }
    }

    const fallback = await getTopics({
      searchParams: {
        ...options.searchParams,
        topic_types: 'fediverse_instance',
      },
    })
    return {
      data: normalizeFediverseInstancesResponse(fallback),
      usesDedicatedEndpoint: false,
    }
  },
)

export const getFediverseInstance = cache(
  async (idOrSlug: string): Promise<FediverseInstanceResponse | null> => {
    return returnNullForMissingEntity(
      serverApi
        .get<unknown>(`/api/v1/fediverse/instances/${encodeURIComponent(idOrSlug)}`)
        .then(normalizeFediverseInstanceResponse),
    )
  },
)
