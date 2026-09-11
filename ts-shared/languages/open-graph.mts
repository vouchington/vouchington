import { ogLocaleMap } from './og-locale-map.mts'
import { normalizeCountryCode } from './countries.mts'
import { normalizeContentLanguageTag } from './content-languages.mts'

/**
 * Maps ISO 639-1 or BCP-47 to OpenGraph locale (e.g. 'en-US' → 'en_US')
 * Returns undefined for unmapped codes so callers can omit invalid locales.
 */
export function toOpenGraphLocale(code: string | null | undefined): string | undefined {
  if (!code) return undefined
  const normalizedCode = code.trim().replaceAll('_', '-')
  const language = normalizeContentLanguageTag(normalizedCode)
  const country = getLocaleCountry(normalizedCode)
  const mapped = language ? ogLocaleMap[language] : undefined
  if (!mapped) return undefined
  return country ? `${language}_${country}` : mapped
}

function getLocaleCountry(tag: string): string | null {
  const [, ...regionParts] = tag.split('-')
  const region = regionParts.find(part => normalizeCountryCode(part) !== null)
  return normalizeCountryCode(region)
}
