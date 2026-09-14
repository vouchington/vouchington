import { normalizeAssetOrigin } from './csp.mts'
import {
  getSentryDsnConfig,
  resolveSentryEnablement,
  SENTRY_CONFIGURATION_WARNING,
} from '@ts-shared/utils/sentry-deployment-gate'
import { isProductionValueInvalid } from './production-mode.mts'

// Module-level flags so warnings fire at most once per isolate. CF Workers
// may run multiple isolates, so these suppress per-request noise within a
// single isolate rather than globally.
let productionValueInvalidLogged = false
let cspAssetOriginInvalidLogged = false
let cachePlaceholderNonceEmptyLogged = false
let cachePlaceholderNonceTooShortLogged = false
let sentryConfigurationInvalidLogged = false

// Below this length the placeholder is guessable enough that a cached page's CSP nonce
// stops being meaningfully secret. Shared with request-handler.mts's canUseCachedOriginForWeb
// gate so a short-but-truthy secret can't slip past that fail-closed check.
export const MIN_CACHE_PLACEHOLDER_NONCE_LENGTH = 32

export function isCachePlaceholderNonceValid(nonce: string | undefined): nonce is string {
  return Boolean(nonce) && (nonce?.length ?? 0) >= MIN_CACHE_PLACEHOLDER_NONCE_LENGTH
}

/**
 * Warn once if PRODUCTION is set to an ambiguous value (truthy but not 'true' or 'false').
 * Values like '1', 'yes', and 'on' fail closed to production mode so HSTS, strict JWT
 * verification, and related production-only controls stay enabled until the config is fixed.
 * Explicitly 'false' is accepted as "not production" and does not trigger the warning.
 */
export function warnIfProductionValueInvalid(env: { PRODUCTION?: string }): void {
  if (isProductionValueInvalid(env) && !productionValueInvalidLogged) {
    console.error(
      `PRODUCTION is set to '${env.PRODUCTION}' but must be exactly 'true' or 'false'; treating it as production mode so security controls fail closed`,
    )
    productionValueInvalidLogged = true
  }
}

/**
 * Warn once if CSP_ASSET_ORIGIN is set but fails validation (malformed URL, wrong protocol, etc.).
 * A misconfigured value is silently dropped by normalizeAssetOrigin(), which means CDN-hosted
 * /_next/static assets would be blocked in production — hard to diagnose without this warning.
 */
export function warnIfCspAssetOriginInvalid(env: { CSP_ASSET_ORIGIN?: string }): void {
  if (
    env.CSP_ASSET_ORIGIN?.trim() &&
    !normalizeAssetOrigin(env.CSP_ASSET_ORIGIN) &&
    !cspAssetOriginInvalidLogged
  ) {
    console.error(
      'CSP_ASSET_ORIGIN failed validation and will be ignored in CSP — static assets may be blocked. Value must be a valid https:// origin (e.g. https://d1234567.cloudfront.net) or http://localhost:<port> for local dev.',
    )
    cspAssetOriginInvalidLogged = true
  }
}

/**
 * Warn once if CACHE_PLACEHOLDER_NONCE is missing or too short. Without it, the gateway
 * never dispatches target==='web' requests to CachedOrigin (see request-handler.mts's
 * canDispatchToCache) — every web HTML response falls back to the uncached bypass path,
 * silently disabling the cache for the highest-traffic audience rather than failing loudly.
 */
export function warnIfCachePlaceholderNonceMissing(env: {
  CACHE_PLACEHOLDER_NONCE?: string
}): void {
  if (!env.CACHE_PLACEHOLDER_NONCE && !cachePlaceholderNonceEmptyLogged) {
    console.error(
      'CACHE_PLACEHOLDER_NONCE is not set or empty — anonymous web HTML responses will bypass the cache entirely; generate with: openssl rand -hex 32',
    )
    cachePlaceholderNonceEmptyLogged = true
    return
  }

  if (
    env.CACHE_PLACEHOLDER_NONCE &&
    !isCachePlaceholderNonceValid(env.CACHE_PLACEHOLDER_NONCE) &&
    !cachePlaceholderNonceTooShortLogged
  ) {
    console.error(
      'CACHE_PLACEHOLDER_NONCE is too short (minimum 32 characters) — generate with: openssl rand -hex 32',
    )
    cachePlaceholderNonceTooShortLogged = true
  }
}

/** Warn once when a deployed Worker cannot initialize its private or browser Sentry configuration. */
export function warnIfSentryConfigurationInvalid(env: {
  ENVIRONMENT?: string
  SENTRY_DSN?: string
  SENTRY_TUNNEL_PREVIOUS_WEB_DSN?: string
  SENTRY_WEB_DSN?: string
}): void {
  const { enabled } = resolveSentryEnablement({
    environment: env.ENVIRONMENT,
    otelEnabled: false,
  })
  const requiredConfigurationInvalid =
    !getSentryDsnConfig(env.SENTRY_DSN) || !getSentryDsnConfig(env.SENTRY_WEB_DSN)
  const rotationConfigurationInvalid =
    env.SENTRY_TUNNEL_PREVIOUS_WEB_DSN !== undefined &&
    !getSentryDsnConfig(env.SENTRY_TUNNEL_PREVIOUS_WEB_DSN)
  if (
    enabled &&
    (requiredConfigurationInvalid || rotationConfigurationInvalid) &&
    !sentryConfigurationInvalidLogged
  ) {
    console.warn(
      requiredConfigurationInvalid
        ? SENTRY_CONFIGURATION_WARNING
        : 'Sentry tunnel rotation overlap is disabled because the previous browser DSN is invalid.',
    )
    sentryConfigurationInvalidLogged = true
  }
}
