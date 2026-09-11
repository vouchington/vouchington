/**
 * HTTP Cache-Control header configuration
 * Only applies to logged-out (unauthenticated) users.
 * Optional-auth routes that set public anonymous cache headers should also vary by Cookie and Authorization.
 */

// Cache duration for short-lived data (e.g., metrics, search results)
export const HTTP_CACHE_SHORT_MAX_AGE_SECONDS =
  Number(process.env.HTTP_CACHE_SHORT_MAX_AGE_SECONDS) || 60

// Cache duration for long-lived data (e.g., individual entities)
export const HTTP_CACHE_LONG_MAX_AGE_SECONDS =
  Number(process.env.HTTP_CACHE_LONG_MAX_AGE_SECONDS) || 300
