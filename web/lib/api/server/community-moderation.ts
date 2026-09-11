import { cache } from 'react'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import { serverApi } from './instance'
import type {
  CommunityBansResponseBody,
  CommunityModeratorStatsResponseBody,
  ModlogResponseBody,
  CommunityModerationQueueResponseBody,
} from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getCommunityBans = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityBansResponseBody> => {
    return serverApi.get<CommunityBansResponseBody>(`/api/v1/communities/${idOrSlug}/bans`, options)
  },
)

export const getCommunityModlog = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<ModlogResponseBody> => {
    return serverApi.get<ModlogResponseBody>(`/api/v1/communities/${idOrSlug}/modlog`, options)
  },
)

export const getCommunityModeratorStats = cache(
  async (
    idOrSlug: string,
    options: GetOptions = {},
  ): Promise<CommunityModeratorStatsResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<CommunityModeratorStatsResponseBody>(
        `/api/v1/communities/${idOrSlug}/moderator-stats`,
        options,
      ),
      { nullStatusCodes: [403, 404] },
    )
  },
)

export const getCommunityModerationQueue = cache(
  async (
    idOrSlug: string,
    options: GetOptions = {},
  ): Promise<CommunityModerationQueueResponseBody> => {
    return serverApi.get<CommunityModerationQueueResponseBody>(
      `/api/v1/communities/${idOrSlug}/moderation-queue`,
      options,
    )
  },
)
