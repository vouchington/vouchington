'use client'

import type { ReactNode } from 'react'
import { UiLocaleContext } from './ui-locale-context'

export function UiLocaleProvider({
  children,
  uiLocale,
}: {
  children: ReactNode
  uiLocale: string
}) {
  return <UiLocaleContext.Provider value={uiLocale}>{children}</UiLocaleContext.Provider>
}
