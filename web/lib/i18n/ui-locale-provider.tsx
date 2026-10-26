'use client'

import type { ReactNode } from 'react'
import { LocaleProvider } from './ui-locale-context'

export function UiLocaleProvider({
  children,
  uiLocale,
}: {
  children: ReactNode
  uiLocale: string
}) {
  return <LocaleProvider locale={uiLocale}>{children}</LocaleProvider>
}
