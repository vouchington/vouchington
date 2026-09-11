import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  ModerationAnalytics,
  ModerationAnalyticsRange,
  ModerationTransparency,
} from '@/types/moderation-analytics'

export const getAdminModerationAnalytics = cache(
  async (options: {
    range: ModerationAnalyticsRange
    headers?: Record<string, string>
  }): Promise<ModerationAnalytics> => {
    return serverApi.get<ModerationAnalytics>('/api/v1/admin/moderation-analytics', {
      searchParams: { range: options.range },
      headers: options.headers,
    })
  },
)

export const getCommunityModerationAnalytics = cache(
  async (
    idOrSlug: string,
    options: {
      range: ModerationAnalyticsRange
      headers?: Record<string, string>
    },
  ): Promise<ModerationAnalytics> => {
    return serverApi.get<ModerationAnalytics>(
      `/api/v1/communities/${idOrSlug}/moderation-analytics`,
      {
        searchParams: { range: options.range },
        headers: options.headers,
      },
    )
  },
)

export const getCommunityModerationAnalyticsOrNull = cache(
  async (
    idOrSlug: string,
    options: {
      range: ModerationAnalyticsRange
      headers?: Record<string, string>
    },
  ): Promise<ModerationAnalytics | null> => {
    return returnNullForMissingEntity(getCommunityModerationAnalytics(idOrSlug, options), {
      nullStatusCodes: [403, 404],
    })
  },
)

export const getModerationTransparency = cache(
  async (options: {
    range: ModerationAnalyticsRange
    headers?: Record<string, string>
  }): Promise<ModerationTransparency> => {
    return serverApi.get<ModerationTransparency>('/api/v1/moderation-transparency', {
      searchParams: { range: options.range },
      headers: options.headers,
    })
  },
)

export const getModerationTransparencyOrNull = cache(
  async (options: {
    range: ModerationAnalyticsRange
    headers?: Record<string, string>
  }): Promise<ModerationTransparency | null> =>
    returnNullForMissingEntity(getModerationTransparency(options), { nullStatusCodes: [403, 404] }),
)

export const getCommunityModerationTransparency = cache(
  async (
    idOrSlug: string,
    options: { range: ModerationAnalyticsRange; headers?: Record<string, string> },
  ): Promise<ModerationTransparency> =>
    serverApi.get<ModerationTransparency>(
      `/api/v1/communities/${idOrSlug}/moderation-transparency`,
      { searchParams: { range: options.range }, headers: options.headers },
    ),
)

/** Do not retain a previously loaded paid aggregate after entitlement loss. */
export const getCommunityModerationTransparencyOrNull = cache(
  async (
    idOrSlug: string,
    options: { range: ModerationAnalyticsRange; headers?: Record<string, string> },
  ): Promise<ModerationTransparency | null> =>
    returnNullForMissingEntity(getCommunityModerationTransparency(idOrSlug, options), {
      nullStatusCodes: [403, 404],
    }),
)
