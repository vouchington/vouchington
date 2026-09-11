'use client'

import { use, useMemo, useSyncExternalStore } from 'react'
import { getFeatureFlagSnapshot, getFeatureFlagServerSnapshot } from './cookies'
import { FeatureFlagsContext } from './context-value'
import type { FeatureFlags } from './shared'

function subscribeFeatureFlagOverrides(callback: () => void): () => void {
  window.addEventListener('feature-flag-overrides-updated', callback)
  return () => window.removeEventListener('feature-flag-overrides-updated', callback)
}

export function useFeatureFlags(): FeatureFlags {
  const { globalFlags } = use(FeatureFlagsContext)
  const overrides = useSyncExternalStore(
    subscribeFeatureFlagOverrides,
    getFeatureFlagSnapshot,
    getFeatureFlagServerSnapshot,
  )

  return useMemo(() => ({ ...globalFlags, ...overrides }), [globalFlags, overrides])
}
