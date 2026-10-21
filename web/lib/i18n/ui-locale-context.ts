'use client'

import { createLocaleBindings } from '@vouchington/localization/react'
import { DEFAULT_UI_LOCALE } from '@ts-shared/languages/ui-locales'

const bindings = createLocaleBindings(DEFAULT_UI_LOCALE)

export const UiLocaleContext = bindings.LocaleContext
export const UiLocaleProviderBinding = bindings.LocaleProvider

export function useUiLocale() {
  return bindings.useLocale()
}
