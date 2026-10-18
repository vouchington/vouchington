export const INTERNAL_CACHE_VARY_HEADER = 'x-voucha-cache-vary'

// Request dimensions emitted by Voucha origins that may be tunneled through Workers Cache.
export const VOUCHA_SAFE_SHARED_CACHE_VARY_TOKENS = [
  'Cookie',
  'Authorization',
  'Accept-Encoding',
  'Accept-Language',
  'RSC',
  'Next-Router-State-Tree',
  'Next-Router-Prefetch',
  'Next-Router-Segment-Prefetch',
  'Next-Url',
] as const
