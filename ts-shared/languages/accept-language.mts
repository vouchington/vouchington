import { bestAcceptLanguageMatch as matchAcceptLanguage } from '@vouchington/utils/language-tags'
import { SUPPORTED_UI_LOCALES, type UiLocale } from './ui-locales.mts'

/**
 * Picks the highest-quality `Accept-Language` range that matches a supported
 * UI locale (see `normalizeUiLocale`). Shared by web's `resolveUiLocale`
 * (DB-aware) and the Cloudflare Worker gateway's `resolveEdgeUiLocale`
 * (edge-only) so both interpret the header identically.
 */
export function bestAcceptLanguageMatch(
  acceptLanguage: string | null | undefined,
): UiLocale | null {
  return matchAcceptLanguage(acceptLanguage, SUPPORTED_UI_LOCALES)
}
