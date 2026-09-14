import type { EnCatalog } from '@ts-shared/ui-messages'
import { cloneCatalog } from './merge-catalog'
import { loadClientMessages } from './load-client-messages'

type FulfilledThenable<T> = Promise<T> & { status: 'fulfilled'; value: T }

type RouteMessagesCache = {
  getMessagesPromise: (locale: string, pathname: string) => Promise<EnCatalog>
  invalidateMessages: (locale: string, pathname: string) => void
  seedMessages: (locale: string, pathname: string, messages: EnCatalog) => void
}

function createFulfilledThenable<T>(value: T): FulfilledThenable<T> {
  const thenable = Promise.resolve(value) as FulfilledThenable<T>
  thenable.status = 'fulfilled'
  thenable.value = value
  return thenable
}

/**
 * Caches the bounded backend batch for each locale and pathname. The regular locale cache keeps
 * the union that translated chrome needs; this cache makes route navigation wait for the
 * destination's selectors before that route's translated components render.
 */
export function createRouteMessagesCache(
  loadMessages: (locale: string, pathname: string) => Promise<EnCatalog>,
): RouteMessagesCache {
  const cache = new Map<string, Promise<EnCatalog>>()
  const failed = new Set<string>()

  function key(locale: string, pathname: string): string {
    return `${locale}\u0000${pathname}`
  }

  function seed(locale: string, pathname: string, messages: EnCatalog): void {
    const cacheKey = key(locale, pathname)
    if (cache.has(cacheKey) && !failed.has(cacheKey)) return
    failed.delete(cacheKey)
    cache.set(cacheKey, createFulfilledThenable(cloneCatalog(messages)))
  }

  function get(locale: string, pathname: string): Promise<EnCatalog> {
    const cacheKey = key(locale, pathname)
    let promise = cache.get(cacheKey)
    if (!promise) {
      promise = loadMessages(locale, pathname)
      cache.set(cacheKey, promise)
      void promise.catch(() => {
        // Keep React's rejected thenable stable until the user explicitly retries.
        if (cache.get(cacheKey) === promise) failed.add(cacheKey)
      })
    }
    return promise
  }

  function invalidate(locale: string, pathname: string): void {
    const cacheKey = key(locale, pathname)
    if (!failed.delete(cacheKey)) return
    cache.delete(cacheKey)
  }

  return { getMessagesPromise: get, invalidateMessages: invalidate, seedMessages: seed }
}

const routeMessagesCache = createRouteMessagesCache(loadClientMessages)

export const {
  getMessagesPromise: getRouteMessagesPromise,
  invalidateMessages: invalidateRouteMessages,
  seedMessages: seedRouteMessages,
} = routeMessagesCache
