'use client'

import { getPaginatedPage } from './paginated'
import {
  isCurrentFediverseInstancesResponse,
  normalizeFediverseInstancesResponse,
} from '../fediverse-instances-normalization'
import type { FediverseInstancesResponse } from '@/types/fediverse-instances'
import type { PaginatedListParams } from '@/hooks/use-paginated-list'

const DEDICATED_INSTANCES_ENDPOINT = '/api/v1/fediverse/instances'
const GENERIC_TOPICS_ENDPOINT = '/api/v1/topics'

export async function getFediverseInstancesContinuationPage(
  endpoint: string,
  searchParams: PaginatedListParams,
): Promise<FediverseInstancesResponse> {
  const response = await getPaginatedPage<unknown>(endpoint, searchParams)
  if (endpoint !== DEDICATED_INSTANCES_ENDPOINT || isCurrentFediverseInstancesResponse(response)) {
    return normalizeFediverseInstancesResponse(response)
  }

  const fallback = await getPaginatedPage<unknown>(GENERIC_TOPICS_ENDPOINT, {
    ...searchParams,
    topic_types: 'fediverse_instance',
  })
  return normalizeFediverseInstancesResponse(fallback)
}
