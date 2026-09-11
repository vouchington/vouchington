import { cache } from 'react'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import { serverApi } from './instance'
import type { ModeratorVacationResponseBody } from '@/types/api-responses'

export const getMyModeratorVacation = cache(
  async (idOrSlug: string): Promise<ModeratorVacationResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<ModeratorVacationResponseBody>(
        `/api/v1/communities/${idOrSlug}/moderator-vacation`,
      ),
      { nullStatusCodes: [403, 404] },
    )
  },
)
