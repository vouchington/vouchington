import { CachedOrigin } from '../../src/cached-origin.mts'
import type { CacheContext, CachePurgeResult } from '@cloudflare/workers-types/index.ts'
import type { CachedOriginProps, Env } from '../../src/types.mts'
import { MemoryCache } from './cache.mts'

export type MockCacheContext = Pick<CacheContext, 'purge'>

export interface EdgeExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void
  passThroughOnException: () => void
  props: Record<string, unknown>
  exports: {
    CachedOrigin: {
      fetch: (request: Request, init: { props: CachedOriginProps }) => Promise<Response>
      purge: (tags: string[]) => Promise<CachePurgeResult>
    }
  }
}

// Captured before any test modifies globals — safe to restore in afterEach.
export const ORIGINAL_FETCH = globalThis.fetch
export const ORIGINAL_CACHES = globalThis.caches

/**
 * Builds the mock `EdgeExecutionContext` passed as `worker.fetch`'s third argument.
 * `env` backs `exports.CachedOrigin.fetch`/`.purge`: a real `CachedOrigin` instance is
 * constructed per call with the given `env` (and `cache`, for purge) so tests exercise
 * CachedOrigin's actual logic rather than a dumb stub. Defaults to an empty `Env` and an
 * absent `cache` so existing zero-arg call sites — ones whose requests never reach the
 * dispatch-to-cache/purge branches — keep compiling unchanged. `cache` defaults to
 * undefined (matching CachedOrigin.purge()'s real fail-loud behavior when the Workers
 * Cache purge API is unavailable) — pass one explicitly to exercise a successful purge.
 */
export const createContext = (env: Env = {} as Env, cache?: MockCacheContext) => {
  const promises: Promise<unknown>[] = []
  const waitUntil = (promise: Promise<unknown>) => {
    promises.push(promise)
  }
  const passThroughOnException = () => {}
  const context: EdgeExecutionContext = {
    waitUntil,
    passThroughOnException,
    props: {},
    exports: {
      CachedOrigin: {
        fetch: (request: Request, init: { props: CachedOriginProps }) =>
          new CachedOrigin(
            { props: init.props, waitUntil, passThroughOnException, cache },
            env,
          ).fetch(request),
        // purge() never reads ctx.props (only ctx.cache) — an empty stub is safe here.
        purge: (tags: string[]) =>
          new CachedOrigin(
            { props: {} as CachedOriginProps, waitUntil, passThroughOnException, cache },
            env,
          ).purge(tags),
      },
    },
  }
  return context
}

export const setupMemoryCaches = (): void => {
  const memoryCache = new MemoryCache()
  globalThis.caches = {
    default: memoryCache,
    open: () => Promise.resolve(memoryCache),
    delete: () => Promise.resolve(false),
    has: () => Promise.resolve(true),
    keys: () => Promise.resolve([]),
    match: () => Promise.resolve<Response | undefined>(void 0),
  } as unknown as CacheStorage
}

export const restoreGlobals = (): void => {
  globalThis.fetch = ORIGINAL_FETCH
  globalThis.caches = ORIGINAL_CACHES
}
