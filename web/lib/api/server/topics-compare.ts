import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { TopicCompareResponseBody } from '@/types/api-responses'

export const getTopicsCompare = cache(
  async (slugA: string, slugB: string): Promise<TopicCompareResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<TopicCompareResponseBody>('/api/v1/topics/compare', {
        searchParams: { slugs: `${slugA},${slugB}` },
      }),
    )
  },
)
