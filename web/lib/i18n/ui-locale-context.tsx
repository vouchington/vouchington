'use client'

import { createLocaleBindings } from '@vouchington/localization/react'
import { DEFAULT_UI_LOCALE } from '@ts-shared/languages/ui-locales'

export const { LocaleProvider, useLocale: useUiLocale } = createLocaleBindings(DEFAULT_UI_LOCALE)
