import type pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'

import { readPool, writePool } from '@data-stores/psql'

export type ObservedPostgresQueryPool = 'read' | 'write'

interface PoolObservationContext {
  active: boolean
  pools: Set<ObservedPostgresQueryPool>
  queryMarker: string
}

const poolObservationContext = new AsyncLocalStorage<PoolObservationContext>()
let poolObservationQueue = Promise.resolve()

export async function observeTestPostgresQueryPools<Result>(
  queryMarker: string,
  operation: () => Promise<Result>,
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

async function runPoolObservationExclusively<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  const previousObservation = poolObservationQueue
  let releaseObservation!: () => void
  poolObservationQueue = new Promise(resolve => {
    releaseObservation = resolve
  })
  await previousObservation
  try {
    return await operation()
  } finally {
    releaseObservation()
  }
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
    if (
      activeContext === expectedContext &&
      expectedContext.active &&
      text.includes(expectedContext.queryMarker)
    ) {
      expectedContext.pools.add(label)
    }
    return Reflect.apply(query, pool, args)
  }) as unknown as pg.Pool['query']
}
