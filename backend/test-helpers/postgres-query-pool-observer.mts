import type pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'

import { readPool, writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from './postgres-pool-observation-queue.mts'

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
): Promise<{ result: Result; queries: ObservedClientQuery[] }> {
  return runPoolObservationExclusively(async () => {
    const queries: ObservedClientQuery[] = []
    const restoreRead = tapClientQueries(readPool, 'read', queries)
    const restoreWrite = tapClientQueries(writePool, 'write', queries)
    try {
      const result = await operation()
      return { result, queries }
    } finally {
      restoreWrite()
      restoreRead()
    }
  })
}

function tapClientQueries(
  pool: pg.Pool,
  label: ObservedPostgresQueryPool,
  queries: ObservedClientQuery[],
): () => void {
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
        const query = client.query
        client.query = ((...queryArgs: unknown[]) => {
          queries.push({ pool: label, text: clientQueryText(queryArgs[0]) })
          return Reflect.apply(query, client, queryArgs)
        }) as typeof client.query
        return client
      })
    }) as typeof pool.connect,
  })
  return () => {
    if (descriptor) Object.defineProperty(pool, 'connect', descriptor)
    else Reflect.deleteProperty(pool, 'connect')
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
    const input = args[0]
    const text =
      typeof input === 'string'
        ? input
        : typeof input === 'object' && input !== null && 'text' in input
          ? String(input.text)
          : ''
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
