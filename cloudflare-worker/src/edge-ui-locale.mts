import { bestAcceptLanguageMatch } from '@ts-shared/languages/accept-language'
import {
  DEFAULT_UI_LOCALE,
  normalizeUiLocale,
  type UiLocale,
} from '@ts-shared/languages/ui-locales'
import type { SessionCachePayload } from './auth/jwt.mts'

/**
 * Resolves the `props.lang` cache partition (see types.mts). Mirrors web's
 * `resolveUiLocale` but restricted to edge-available signals — no DB-backed
 * `preferredUiLocale`, since this runs on every anon request rather than only
 * authenticated ones.
 *
 * `sessionPayload` is null on every real call site today: this is only ever
 * called for the `anon` cache audience, and `deriveSessionCachePayload`
 * (auth/jwt.mts) only returns a payload for uid-bearing sessions — which
 * route to the `BYPASS` cache policy, never `anon` (see cache-policy.mts).
 * The `uil` claim itself is also currently minted only on authenticated
 * sessions (see backend/services/jwt-session/create.mts). The session-payload
 * branch is wired through anyway as forward-compatible groundwork, exercised
 * directly by this function's own tests rather than through a real request.
 */
export function resolveEdgeUiLocale(
  request: Request,
  sessionPayload: SessionCachePayload | null,
): UiLocale {
  return (
    normalizeUiLocale(sessionPayload?.uil) ??
    bestAcceptLanguageMatch(request.headers.get('accept-language')) ??
    DEFAULT_UI_LOCALE
  )
}

/**
 * Omits `lang` from CachedOriginProps at the default UI locale so the anon
 * cache key gains no extra fan-out for the common (English) case.
 */
export function omitAtDefaultLocale(lang: UiLocale): UiLocale | undefined {
  return lang === DEFAULT_UI_LOCALE ? undefined : lang
}
