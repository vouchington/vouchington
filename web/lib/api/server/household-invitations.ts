import { cache } from 'react'
import { serverApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type { HouseholdInvitation } from '@/types/household-invitations'

type PageOptions = { after?: string; limit?: number }

export const getHouseholdInvitations = cache((householdId: string, options: PageOptions = {}) =>
  serverApi.get<ListResponse<HouseholdInvitation>>(
    `/api/v1/households/${encodeURIComponent(householdId)}/invitations`,
    { searchParams: options },
  ),
)

export const getMyHouseholdInvitations = cache((options: PageOptions = {}) =>
  serverApi.get<ListResponse<HouseholdInvitation>>('/api/v1/my/household-invitations', {
    searchParams: options,
  }),
)
