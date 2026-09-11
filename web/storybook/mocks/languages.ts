export const CONTENT_LANGUAGE_SELECT_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'ar', label: 'Arabic' },
]

export const COUNTRY_SELECT_OPTIONS = [{ value: 'US', label: 'United States' }]
export const DEFAULT_UI_LOCALE = 'en'
export const SUPPORTED_UI_LOCALES = ['en', 'es', 'fr', 'pt'] as const
export const UI_LOCALE_SELECT_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
]

const SUPPORTED_UI_LOCALE_SET = new Set<string>(SUPPORTED_UI_LOCALES)

const RTL_CODES = new Set(['ar', 'dv', 'fa', 'he', 'ps', 'sd', 'ug', 'ur', 'yi'])

// Mock uses a minimal code set for Storybook; the real module validates against ISO 639-1 codes.
export function normalizeContentLanguageTag(tag: string | null | undefined): string | null {
  if (!tag) return null
  const base = tag.trim().split(/[-_]/)[0]?.toLowerCase() ?? ''
  return CONTENT_LANGUAGE_SELECT_OPTIONS.some(option => option.value === base) ? base : null
}

export function getContentLanguageDir(lang: string | null | undefined): 'rtl' | 'ltr' | 'auto' {
  if (!lang) return 'auto'
  const base = lang.trim().split(/[-_]/)[0]?.toLowerCase() ?? ''
  return RTL_CODES.has(base) ? 'rtl' : 'ltr'
}

export function getEffectiveContentLanguage({
  declaredLanguage,
  detectedLanguage,
}: {
  declaredLanguage?: string | null
  detectedLanguage?: string | null
}): string | undefined {
  return (
    normalizeContentLanguageTag(declaredLanguage) ??
    normalizeContentLanguageTag(detectedLanguage) ??
    undefined
  )
}

export function normalizeUiLocale(
  tag: string | null | undefined,
): (typeof SUPPORTED_UI_LOCALES)[number] | null {
  if (!tag) return null
  const normalized = tag.trim().replaceAll('_', '-').toLowerCase()
  if (SUPPORTED_UI_LOCALE_SET.has(normalized)) {
    return normalized as (typeof SUPPORTED_UI_LOCALES)[number]
  }
  const base = normalized.split('-')[0]
  return base && SUPPORTED_UI_LOCALE_SET.has(base)
    ? (base as (typeof SUPPORTED_UI_LOCALES)[number])
    : null
}

// Storybook only needs the English Open Graph locale for current stories.
export function toOpenGraphLocale(code: string | null | undefined): string | undefined {
  return code ? 'en_US' : undefined
}
