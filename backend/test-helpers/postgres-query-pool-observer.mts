import type pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'

import { readPool, writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

export type ObservedPostgresQueryPool = 'read' | 'write'

export type ObservedClientQuery = {
  pool: ObservedPostgresQueryPool
  text: string
}

interface PoolObservationContext {
  active: boolean
  pools: Set<ObservedPostgresQueryPool>
  queryMarker: string
  onQueryComplete?: () => void | Promise<void>
}

const poolObservationContext = new AsyncLocalStorage<PoolObservationContext>()

export async function observeTestPostgresQueryPools<Result>(
  queryMarker: string,
  operation: () => Promise<Result>,
  onQueryComplete?: () => void | Promise<void>,
): Promise<{ result: Result; pools: ObservedPostgresQueryPool[] }> {
  const activeObservation = poolObservationContext.getStore()
  if (activeObservation?.active) {
    if (activeObservation.queryMarker !== queryMarker) {
      throw new Error('Nested PostgreSQL pool observations must use the same query marker')
    }
    const result = await operation()
    return { result, pools: [...activeObservation.pools] }
  }

  return runPoolObservationExclusively(async () => {
    const context: PoolObservationContext = {
      active: true,
      pools: new Set(),
      queryMarker,
      onQueryComplete,
    }
    return poolObservationContext.run(context, async () => {
      try {
        const result = await observePoolQueries(context, operation)
        return { result, pools: [...context.pools] }
      } finally {
        context.active = false
      }
    })
  })
}

async function observePoolQueries<Result>(
  context: PoolObservationContext,
  operation: () => Promise<Result>,
): Promise<Result> {
  const readQueryDescriptor = Object.getOwnPropertyDescriptor(readPool, 'query')
  const writeQueryDescriptor = Object.getOwnPropertyDescriptor(writePool, 'query')
  const originalReadQuery = readPool.query
  const originalWriteQuery = writePool.query
  try {
    installQueryWrapper(readPool, wrapQuery(readPool, originalReadQuery, 'read', context))
    installQueryWrapper(writePool, wrapQuery(writePool, originalWriteQuery, 'write', context))
    return await operation()
  } finally {
    try {
      restoreQueryProperty(readPool, readQueryDescriptor)
    } finally {
      restoreQueryProperty(writePool, writeQueryDescriptor)
    }
  }
}

/** Records SQL run on a borrowed client. COPY does not go through `pool.query`. */
export async function observeTestPostgresClientQueries<Result>(
  operation: () => Promise<Result>,
  onQueryComplete?: (query: ObservedClientQuery) => Promise<void>,
): Promise<{ result: Result; queries: ObservedClientQuery[] }> {
  return runPoolObservationExclusively(async () => {
    const queries: ObservedClientQuery[] = []
    let active = true
    const completed = async (query: ObservedClientQuery) => {
      if (active) await onQueryComplete?.(query)
    }
    const restoreRead = tapClientQueries(readPool, 'read', queries, completed)
    const restoreWrite = tapClientQueries(writePool, 'write', queries, completed)
    try {
      const result = await operation()
      return { result, queries }
    } finally {
      active = false
      restoreWrite()
      restoreRead()
    }
  })
}

function tapClientQueries(
  pool: pg.Pool,
  label: ObservedPostgresQueryPool,
  queries: ObservedClientQuery[],
  onQueryComplete: (query: ObservedClientQuery) => Promise<void>,
): () => void {
  const restoreClients: Array<() => void> = []
  const descriptor = Object.getOwnPropertyDescriptor(pool, 'connect')
  const original = pool.connect
  Object.defineProperty(pool, 'connect', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: ((...args: unknown[]) => {
      if (args.some(arg => typeof arg === 'function')) return Reflect.apply(original, pool, args)
      return Promise.resolve(Reflect.apply(original, pool, args)).then(client => {
        if (!client) return client
        const queryDescriptor = Object.getOwnPropertyDescriptor(client, 'query')
        const query = client.query
        const wrappedQuery = ((...queryArgs: unknown[]) => {
          const observed = { pool: label, text: clientQueryText(queryArgs[0]) }
          queries.push(observed)
          const pending = Reflect.apply(query, client, queryArgs)
          if (
            queryArgs.some(arg => typeof arg === 'function') ||
            typeof pending !== 'object' ||
            pending === null ||
            !('then' in pending) ||
            typeof pending.then !== 'function'
          )
            return pending
          return Promise.resolve(pending).then(async (result: unknown) => {
            await onQueryComplete(observed)
            return result
          })
        }) as typeof client.query
        client.query = wrappedQuery
        restoreClients.push(() => {
          if (client.query !== wrappedQuery) return
          if (queryDescriptor) Object.defineProperty(client, 'query', queryDescriptor)
          else Reflect.deleteProperty(client, 'query')
        })
        return client
      })
    }) as typeof pool.connect,
  })
  return () => {
    if (descriptor) Object.defineProperty(pool, 'connect', descriptor)
    else Reflect.deleteProperty(pool, 'connect')
    for (const restore of restoreClients.toReversed()) restore()
  }
}

function clientQueryText(input: unknown): string {
  if (typeof input === 'string') return input
  if (typeof input === 'object' && input !== null && 'text' in input) return String(input.text)
  return ''
}

function installQueryWrapper(pool: pg.Pool, query: pg.Pool['query']): void {
  Object.defineProperty(pool, 'query', {
    configurable: true,
    enumerable: true,
    value: query,
    writable: true,
  })
}

function restoreQueryProperty(pool: pg.Pool, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(pool, 'query', descriptor)
  else Reflect.deleteProperty(pool, 'query')
}

function wrapQuery(
  pool: pg.Pool,
  query: pg.Pool['query'],
  label: ObservedPostgresQueryPool,
  expectedContext: PoolObservationContext,
): pg.Pool['query'] {
  return ((...args: unknown[]) => {
    const text = clientQueryText(args[0])
    const activeContext = poolObservationContext.getStore()
    const matchesContext =
      activeContext === expectedContext &&
      expectedContext.active &&
      text.includes(expectedContext.queryMarker)
    if (matchesContext) expectedContext.pools.add(label)
    const result = Reflect.apply(query, pool, args)
    if (matchesContext && expectedContext.onQueryComplete)
      return Promise.resolve(result).then(async value => {
        await expectedContext.onQueryComplete?.()
        return value
      })
    return result
  }) as unknown as pg.Pool['query']
}
