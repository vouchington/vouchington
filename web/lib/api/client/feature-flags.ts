'use client'

import { clientApi } from './instance'
import type { FeatureFlags } from '@/lib/feature-flags/shared'

export interface FeatureFlagsResponse {
  flags: FeatureFlags
  overrides: FeatureFlags
}

export function getFeatureFlagsClient(): Promise<FeatureFlagsResponse> {
  return clientApi.get<FeatureFlagsResponse>('/api/v1/feature-flags')
}
