import { AsyncLocalStorage } from 'node:async_hooks'
import type { IncomingMessage, ServerResponse } from 'node:http'

type HttpListener<Result> = (request: IncomingMessage, response: ServerResponse) => Result

/**
 * Per-request store for the acting user and committed user-agent string IDs.
 * Communities, posts, topics, URLs, and target users stay out of this store.
 */
export type RequestContextStore = {
  currentUser?: unknown
  userAgentStringIds?: Map<string, string>
}

const requestContext = new AsyncLocalStorage<RequestContextStore>()

export function createRequestContextListener<Result>(
  listener: HttpListener<Result>,
): HttpListener<Result> {
  return (request, response) => requestContext.run({}, () => listener(request, response))
}

/** Runs `fn` inside an empty request store. Workers and scripts stay outside it. */
export function runWithRequestContext<T>(fn: () => T): T {
  return requestContext.run({}, fn)
}

export function hasRequestContext(): boolean {
  return requestContext.getStore() !== undefined
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

/** Drops the memo for this user so the next read sees a later write in the same request. */
export function clearRequestCurrentUser(userId: string): void {
  const store = requestContext.getStore()
  if (!store || !Object.hasOwn(store, 'currentUser')) return
  if ((store.currentUser as { id?: string } | null)?.id !== userId) return
  store.currentUser = undefined
}

/** Returns only a committed ID previously resolved for this normalized agent in this request. */
export function getRequestUserAgentStringId(normalizedUserAgent: string): string | undefined {
  return requestContext.getStore()?.userAgentStringIds?.get(normalizedUserAgent)
}

export function setRequestUserAgentStringId(normalizedUserAgent: string, id: string): void {
  const store = requestContext.getStore()
  if (!store) return
  store.userAgentStringIds ??= new Map()
  store.userAgentStringIds.set(normalizedUserAgent, id)
}
