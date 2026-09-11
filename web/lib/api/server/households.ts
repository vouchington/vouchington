import { cache } from 'react'
import { serverApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type { Household, HouseholdListOptions, HouseholdMembership } from '@/types/my'

type HouseholdRequestOptions = HouseholdListOptions & { headers?: Record<string, string> }

export const getHouseholds = cache(
  async (options: HouseholdRequestOptions = {}): Promise<ListResponse<Household>> => {
    const { headers, ...searchParams } = options
    return serverApi.get<ListResponse<Household>>('/api/v1/households', {
      headers,
      searchParams,
    })
  },
)

export const getHouseholdMemberships = cache(
  async (
    householdId: string,
    options: { after?: string; headers?: Record<string, string>; limit?: number } = {},
  ): Promise<ListResponse<HouseholdMembership>> => {
    const { headers, ...searchParams } = options
    return serverApi.get<ListResponse<HouseholdMembership>>(
      `/api/v1/households/${householdId}/memberships`,
      { headers, searchParams },
    )
  },
)
