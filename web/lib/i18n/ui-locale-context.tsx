'use client'

import { createContext, use } from 'react'
import { DEFAULT_UI_LOCALE } from '@ts-shared/languages/ui-locales'

export const UiLocaleContext = createContext<string>(DEFAULT_UI_LOCALE)

export function useUiLocale() {
  return use(UiLocaleContext)
}
