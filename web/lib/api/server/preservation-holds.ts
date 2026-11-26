import { cache } from 'react'
import { returnNullForMissingEntity } from '@vouchington/api-client'
import { serverApi } from './instance'
import type { UserPreservationHoldsResponse } from '@/types/api-responses'

export const getUserPreservationHoldState = cache(
  async (userId: string): Promise<UserPreservationHoldsResponse | null> =>
    returnNullForMissingEntity(
      serverApi.get<UserPreservationHoldsResponse>(
        `/api/v1/users/${encodeURIComponent(userId)}/preservation-hold`,
      ),
    ),
)
