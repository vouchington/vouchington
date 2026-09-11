import { cache } from 'react'
import { serverApi } from './instance'
import type { PlatformStatsResponse } from '@/types/api-responses'

export const getPlatformStats = cache(async (): Promise<PlatformStatsResponse> => {
  return serverApi.get<PlatformStatsResponse>('/api/v1/platform-stats')
})
