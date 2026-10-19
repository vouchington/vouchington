import { AsyncLocalStorage } from 'node:async_hooks'
import type { IncomingMessage, ServerResponse } from 'node:http'

type HttpListener = (request: IncomingMessage, response: ServerResponse) => void

/**
 * Per-request store. The only field today is the acting user. Tracing fields can be added later.
 * Communities, posts, topics, URLs, and target users stay out of this store.
 */
export type RequestContextStore = {
  currentUser?: unknown
}

const requestContext = new AsyncLocalStorage<RequestContextStore>()

export function createRequestContextListener(listener: HttpListener): HttpListener {
  return (request, response) => {
    requestContext.run({}, () => {
      listener(request, response)
    })
  }
}

/** Runs `fn` inside an empty request store. Workers and scripts stay outside it. */
export function runWithRequestContext<T>(fn: () => T): T {
  return requestContext.run({}, fn)
}

/**
 * The acting user loaded for this request.
 * `undefined` means there is no request store, or this request has not loaded the actor yet.
 */
export function getRequestCurrentUser<T>(): T | null | undefined {
  const store = requestContext.getStore()
  if (!store || !Object.hasOwn(store, 'currentUser')) return undefined
  return store.currentUser as T | null
}

export function setRequestCurrentUser(currentUser: unknown): void {
  const store = requestContext.getStore()
  if (!store) return
  store.currentUser = currentUser
}
