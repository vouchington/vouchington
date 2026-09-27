/* oxlint-disable vitest/require-top-level-describe -- setup restores only its own environment entries after the isolated file. */
import { afterAll, inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    platformStatsCache: { url: string; owner: string }
  }
}

const { url, owner } = inject('platformStatsCache')
const endpoint = new URL(url)
if (
  endpoint.protocol !== 'redis:' ||
  endpoint.hostname !== '127.0.0.1' ||
  !endpoint.port ||
  endpoint.username ||
  endpoint.password ||
  endpoint.search ||
  (endpoint.pathname !== '' && endpoint.pathname !== '/') ||
  !/^[a-f0-9-]{36}$/.test(owner)
)
  throw new Error('Invalid private platform-stats cache endpoint or ownership marker')

const changedKeys = ['VALKEY_CACHE_URL', 'VALKEY_RATE_LIMITER_URL', 'VALKEY_BLOOM_URL'] as const
const previous = new Map(changedKeys.map(key => [key, process.env[key]]))
const defaultUrl =
  process.env.VALKEY_URL || `redis://${process.env.DOCKER_HOST_IP || 'localhost'}:6379`
const previousCacheUrl = process.env.VALKEY_CACHE_URL || defaultUrl
process.env.VALKEY_RATE_LIMITER_URL ||= previousCacheUrl
process.env.VALKEY_BLOOM_URL ||= previousCacheUrl
process.env.VALKEY_CACHE_URL = url

afterAll(() => {
  for (const key of changedKeys) {
    const value = previous.get(key)
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
})
