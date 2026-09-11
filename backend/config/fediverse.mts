import { readOptionalConfigEnv, readOptionalConfigEnvWithDefault } from './env.mts'

export const FEDIVERSE_PEERTUBE_HOST = readOptionalConfigEnvWithDefault(
  'FEDIVERSE_PEERTUBE_HOST',
  'sepiasearch.org',
)
export const FEDIVERSE_MASTODON_HOST = readOptionalConfigEnvWithDefault(
  'FEDIVERSE_MASTODON_HOST',
  'mastodon.social',
)
export const FEDIVERSE_LEMMY_HOST = readOptionalConfigEnvWithDefault(
  'FEDIVERSE_LEMMY_HOST',
  'lemmy.world',
)
export const FEDIVERSE_BLUESKY_HOST = readOptionalConfigEnvWithDefault(
  'FEDIVERSE_BLUESKY_HOST',
  'public.api.bsky.app',
)

// ElasticSearch-backed Mastodon status search (v2/search resolve=false, type=statuses) requires a
// user-authorized OAuth token with the `read:search` scope (obtained via the standard user
// authorization flow) — a client-credentials app-only token is rejected. Without a valid token,
// the Mastodon adapter degrades statuses to a `partial` bucket.
export const FEDIVERSE_MASTODON_ACCESS_TOKEN = readOptionalConfigEnv(
  'FEDIVERSE_MASTODON_ACCESS_TOKEN',
)

export const FEDIVERSE_PROVIDER_TIMEOUT_MS = 4_000
export const FEDIVERSE_SEARCH_DEADLINE_MS = 5_000
export const FEDIVERSE_SEARCH_CACHE_TTL_SECONDS = 90

// Untyped searches chain multiple sub-fetches (e.g. Mastodon accounts then statuses)
// sequentially within one adapter call. Each sub-fetch is already capped at
// FEDIVERSE_PROVIDER_TIMEOUT_MS, but two-to-three healthy calls in a row can still exceed
// FEDIVERSE_SEARCH_DEADLINE_MS. This bounds the adapter's *total* sub-fetch time, leaving
// headroom below the deadline for cache round-trips and bucket assembly.
export const FEDIVERSE_ADAPTER_BUDGET_MS = 4_500
