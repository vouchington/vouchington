// Throttle windows for the dispatchers' deduplication ids; each id carries the domain prefix.
export const ENGAGEMENT_DISPATCH_DEDUP_TTL_MS = 3_600_000
export const MODERATION_SUMMARY_DISPATCH_DEDUP_TTL_MS = 55_000
export const API_KEY_EXPIRY_DEDUP_TTL_MS = 60_000
