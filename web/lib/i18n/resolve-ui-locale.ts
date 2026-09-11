import { bestAcceptLanguageMatch } from '@ts-shared/languages/accept-language'
import {
  DEFAULT_UI_LOCALE,
  normalizeUiLocale,
  type UiLocale,
} from '@ts-shared/languages/ui-locales'

/**
 * Resolves the actual UI message locale. Content language and account country
 * are intentionally not inputs here. `bestAcceptLanguageMatch` lives in
 * `@ts-shared/languages` so the Cloudflare Worker gateway's edge-only
 * `resolveEdgeUiLocale` (cloudflare-worker/src/edge-ui-locale.mts) parses
 * `Accept-Language` identically.
 */
export function resolveUiLocale(params: {
  preferredUiLocale?: string | null
  sessionUiLocale?: string | null
  acceptLanguage?: string | null
}): UiLocale {
  return (
    normalizeUiLocale(params.preferredUiLocale) ??
    normalizeUiLocale(params.sessionUiLocale) ??
    bestAcceptLanguageMatch(params.acceptLanguage) ??
    DEFAULT_UI_LOCALE
  )
}
