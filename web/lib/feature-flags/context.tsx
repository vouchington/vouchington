'use client'

import { type ReactNode, useMemo } from 'react'
import { FeatureFlagsContext } from './context-value'
import type { FeatureFlags } from './shared'

export function FeatureFlagsProvider({
  children,
  globalFlags,
}: {
  children: ReactNode
  globalFlags: FeatureFlags
}) {
  const value = useMemo(() => ({ globalFlags }), [globalFlags])
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>
}
