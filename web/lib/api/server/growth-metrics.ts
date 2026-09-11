import { cache } from 'react'
import { serverApi } from './instance'
import type { GrowthMetrics, GrowthRange } from '@/types/growth-metrics'

export const getGrowthMetrics = cache(
  async (options: {
    range: GrowthRange
    headers?: Record<string, string>
  }): Promise<GrowthMetrics> => {
    return serverApi.get<GrowthMetrics>('/api/v1/growth-metrics', {
      searchParams: { range: options.range },
      headers: options.headers,
    })
  },
)
