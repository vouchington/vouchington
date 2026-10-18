'use client'

import type { ReactNode } from 'react'
import { UiLocaleProviderBinding } from './ui-locale-context'

export function UiLocaleProvider({
  children,
  uiLocale,
}: {
  children: ReactNode
  uiLocale: string
}) {
  return <UiLocaleProviderBinding locale={uiLocale}>{children}</UiLocaleProviderBinding>
}
