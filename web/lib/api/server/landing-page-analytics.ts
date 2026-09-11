import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { LandingPageAnalytics } from '@/types/landing-pages'

interface LandingPageAnalyticsResponseBody {
  analytics: LandingPageAnalytics
}

export const getMyLandingPageAnalytics = cache(
  async (pageId: string): Promise<LandingPageAnalytics | null> => {
    return returnNullForMissingEntity(
      serverApi
        .get<LandingPageAnalyticsResponseBody>(
          `/api/v1/my/landing-pages/${encodeURIComponent(pageId)}/analytics`,
        )
        .then(data => data.analytics),
    )
  },
)
