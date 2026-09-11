import { LINGUA_LANGUAGES } from './codes.mts'

export type ContentLanguageSelectOption = {
  value: string
  label: string
}

export const CONTENT_LANGUAGE_SELECT_OPTIONS: ContentLanguageSelectOption[] = LINGUA_LANGUAGES.map(
  language => ({
    value: language.iso6391,
    label: language.englishName,
  }),
).sort((left, right) => left.label.localeCompare(right.label))

export const CONTENT_LANGUAGE_CODE_SET = new Set<string>(
  LINGUA_LANGUAGES.map(language => language.iso6391),
)

/**
 * Normalize a BCP-47 language tag to an ISO 639-1 content language we support.
 * Examples: 'en-US' -> 'en', 'FR' -> 'fr', 'unknown' -> null
 */
export function normalizeContentLanguageTag(tag: string | null | undefined): string | null {
  if (!tag) return null
  const base = tag.trim().split(/[-_]/)[0]?.toLowerCase()
  return base && CONTENT_LANGUAGE_CODE_SET.has(base) ? base : null
}

/**
 * ISO 639-1 codes whose primary script is right-to-left.
 * Used to derive an explicit `dir` attribute from a known content language,
 * avoiding the first-strong-character heuristic of `dir="auto"`.
 */
const RTL_CONTENT_LANGUAGE_CODES = new Set([
  'ar', // Arabic
  'dv', // Divehi
  'fa', // Persian
  'he', // Hebrew
  'ps', // Pashto
  'sd', // Sindhi
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
])

/**
 * Return the HTML `dir` attribute value for a content language.
 * When `lang` is known, returns an explicit direction so the block base
 * direction is correct regardless of first-character heuristics.
 * Falls back to `'auto'` when no language is available.
 */
export function getContentLanguageDir(lang: string | null | undefined): 'rtl' | 'ltr' | 'auto' {
  if (!lang) return 'auto'
  return RTL_CONTENT_LANGUAGE_CODES.has(lang) ? 'rtl' : 'ltr'
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
