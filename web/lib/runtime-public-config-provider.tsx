'use client'

import type { ReactNode } from 'react'
import type { RuntimePublicConfig } from './runtime-public-config'
import { RuntimePublicConfigContext } from './runtime-public-config-context'

export function RuntimePublicConfigProvider({
  children,
  config,
}: {
  children: ReactNode
  config: RuntimePublicConfig
}) {
  return (
    <RuntimePublicConfigContext.Provider value={config}>
      {children}
    </RuntimePublicConfigContext.Provider>
  )
}
