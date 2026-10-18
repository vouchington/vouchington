import { parsePathSet, toPositiveNumber } from '@vouchington/edge'
import { WELL_KNOWN_PATHS } from './specification-documents.mts'
import type { Env } from './types.mts'

const DEFAULT_SITEMAP_CACHE_TTL_SECONDS = 60 * 60 * 24
const DEFAULT_STATIC_CACHE_TTL_SECONDS = 60 * 60 * 24
const DEFAULT_BOT_CACHE_TTL_SECONDS = 60 * 60 * 24
const DEFAULT_ANON_CACHE_TTL_SECONDS = 30
const DEFAULT_RSS_CACHE_TTL_SECONDS = 300
const DEFAULT_STATIC_CACHED_PATHS = [
  '/favicon.ico',
  '/robots.txt',
  '/llms.txt',
  '/llms-full.txt',
  ...WELL_KNOWN_PATHS,
]

export type WorkerRequestConfig = {
  anonCacheTtlSeconds: number
  botCacheTtlSeconds: number
  rssCacheTtlSeconds: number
  sitemapCacheTtlSeconds: number
  staticCachedPaths: Set<string>
  staticCacheTtlSeconds: number
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
    staticCachedPaths: parsePathSet(env.CACHED_STATIC_PATHS, DEFAULT_STATIC_CACHED_PATHS),
  }
}
