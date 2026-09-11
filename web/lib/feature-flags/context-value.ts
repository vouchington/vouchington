import { createContext } from 'react'
import type { FeatureFlags } from './shared'

export const EMPTY_CONTEXT_FEATURE_FLAGS: FeatureFlags = {}

export interface FeatureFlagsContextValue {
  globalFlags: FeatureFlags
}

export const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  globalFlags: EMPTY_CONTEXT_FEATURE_FLAGS,
})
