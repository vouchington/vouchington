// Query params stripped from the dispatch URL before it is sent to the Workers
// Cache platform. Workers Cache has no response-header-based cache-key
// normalization (the old `no-vary-search` HTTP header only applied to the
// classic `caches.default` API) — instead, the gateway must pre-normalize the
// URL it dispatches with, since (entrypoint, canonical URL, ctx.props) is the
// entire cache key. Named marketing/tracking params never change response
// content, so collapsing them here is what lets e.g. `?utm_source=a` and
// `?utm_source=b` share one cached entry instead of fragmenting the cache.
export const NO_VARY_SEARCH_PARAM_NAMES = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
]

const NO_VARY_SEARCH_PARAM_SET = new Set(NO_VARY_SEARCH_PARAM_NAMES)

// Builds the canonical dispatch URL: strips the tracking params above, then
// sorts remaining params so key order never fragments the cache (e.g.
// `?a=1&b=2` and `?b=2&a=1` collapse to the same entry).
export const normalizeCacheUrl = (rawUrl: string): string => {
  const url = new URL(rawUrl)
  for (const paramName of NO_VARY_SEARCH_PARAM_SET) {
    url.searchParams.delete(paramName)
  }
  // Next.js's own RSC cache-buster (a per-build hash) — redundant with CachedOriginProps.isRsc,
  // which already partitions the cache key by RSC-ness explicitly. Kept out of
  // NO_VARY_SEARCH_PARAM_NAMES above since it isn't a marketing/tracking param.
  url.searchParams.delete('_rsc')
  url.searchParams.sort()
  return url.toString()
}
