import { cache } from 'react'
import { serverApi } from './instance'
import type { FeatureFlags } from '@/lib/feature-flags/shared'

interface FeatureFlagsResponse {
  flags: FeatureFlags
  overrides: FeatureFlags
}

export const getFeatureFlags = cache(
  async (options?: { headers?: Record<string, string> }): Promise<FeatureFlagsResponse> => {
    return serverApi.get<FeatureFlagsResponse>('/api/v1/feature-flags', options)
  },
)
