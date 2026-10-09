import { AsyncLocalStorage } from 'node:async_hooks'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { QueryOptions } from '@data-stores/psql/types'

type HttpListener = (request: IncomingMessage, response: ServerResponse) => void
const requestQueries = new AsyncLocalStorage<Readonly<QueryOptions & { now?: Date }>>()

/** Server-owned execution dependency; nothing is selected from request headers or inputs. */
export function createRequestQueryOptionsListener(
  listener: HttpListener,
  options: QueryOptions & { now?: Date },
): HttpListener {
  const scope = Object.freeze({ ...options })
  return (request, response) => requestQueries.run(scope, () => listener(request, response))
}

export function getRequestQueryOptions(): QueryOptions & { now?: Date } {
  return requestQueries.getStore() ?? {}
}
