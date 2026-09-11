import { normalizeLanguageTag } from '@vouchington/utils/language-tags'

export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number]

export type UiLocaleSelectOption = {
  value: UiLocale
  label: string
}

export const DEFAULT_UI_LOCALE = 'en' as const

export const SUPPORTED_UI_LOCALES = ['en', 'es', 'fr', 'pt'] as const

export const UI_LOCALE_SELECT_OPTIONS: UiLocaleSelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
]

export function normalizeUiLocale(tag: string | null | undefined): UiLocale | null {
  return normalizeLanguageTag(tag, SUPPORTED_UI_LOCALES)
}
