'use client'

import { createContext, use } from 'react'
import { getBrowserRuntimePublicConfig, type RuntimePublicConfig } from './runtime-public-config'

export const RuntimePublicConfigContext = createContext<RuntimePublicConfig | null>(null)

export function useRuntimePublicConfig(): RuntimePublicConfig {
  return use(RuntimePublicConfigContext) ?? getBrowserRuntimePublicConfig()
}
