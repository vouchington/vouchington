import type { BotTier } from './bot-tier.mts'
import { parseStaticCachedPaths, toPositiveNumber } from './cache-policy.mts'
import type { Env } from './types.mts'

const DEFAULT_SITEMAP_CACHE_TTL_SECONDS = 60 * 60 * 24
const DEFAULT_STATIC_CACHE_TTL_SECONDS = 60 * 60 * 24
const DEFAULT_BOT_CACHE_TTL_SECONDS = 60 * 60 * 24
const DEFAULT_ANON_CACHE_TTL_SECONDS = 30
const DEFAULT_RSS_CACHE_TTL_SECONDS = 300

export type WorkerRequestConfig = {
  anonCacheTtlSeconds: number
  botCacheTtlSeconds: number
  rssCacheTtlSeconds: number
  sitemapCacheTtlSeconds: number
  staticCachedPaths: Set<string>
  staticCacheTtlSeconds: number
}

export type WorkerRequestState = {
  botTier: BotTier | null
  countryCode: string | null
  cspNonce: string
  ip: string | null
  requestId: string
  url: URL
  webCsp: string
}

export function getWorkerRequestConfig(env: Env): WorkerRequestConfig {
  return {
    sitemapCacheTtlSeconds: toPositiveNumber(
      env.SITEMAP_CACHE_TTL_SECONDS,
      DEFAULT_SITEMAP_CACHE_TTL_SECONDS,
    ),
    staticCacheTtlSeconds: toPositiveNumber(
      env.STATIC_CACHE_TTL_SECONDS,
      DEFAULT_STATIC_CACHE_TTL_SECONDS,
    ),
    botCacheTtlSeconds: toPositiveNumber(env.BOT_CACHE_TTL_SECONDS, DEFAULT_BOT_CACHE_TTL_SECONDS),
    anonCacheTtlSeconds: toPositiveNumber(
      env.ANON_CACHE_TTL_SECONDS,
      DEFAULT_ANON_CACHE_TTL_SECONDS,
    ),
    rssCacheTtlSeconds: toPositiveNumber(env.RSS_CACHE_TTL_SECONDS, DEFAULT_RSS_CACHE_TTL_SECONDS),
    staticCachedPaths: parseStaticCachedPaths(env.CACHED_STATIC_PATHS),
  }
}
