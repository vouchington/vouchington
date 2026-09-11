import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { ListResponse } from '@/types/api-responses'
import type { LandingPage, LandingPageAnalytics, LandingPageWithItems } from '@/types/landing-pages'

interface AdminLandingPageAnalyticsResponseBody {
  landing_page: LandingPageWithItems
  analytics: LandingPageAnalytics
}

export const getAdminLandingPagesForUser = cache(
  async (
    userId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<ListResponse<LandingPage> | null> => {
    return returnNullForMissingEntity(
      serverApi.get<ListResponse<LandingPage>>(
        `/api/v1/admin/users/${encodeURIComponent(userId)}/landing-pages`,
        options,
      ),
    )
  },
)

export const getAdminLandingPageAnalytics = cache(
  async (
    pageId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<AdminLandingPageAnalyticsResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<AdminLandingPageAnalyticsResponseBody>(
        `/api/v1/admin/landing-pages/${encodeURIComponent(pageId)}/analytics`,
        options,
      ),
    )
  },
)
