import assert from 'node:assert'
import { AsyncLocalStorage } from 'node:async_hooks'
import type pg from 'pg'

import { readPool } from '@data-stores/psql'

type MissingUserReadContext = { active: boolean; interceptions: number }

const missingUserReadContext = new AsyncLocalStorage<MissingUserReadContext>()
let missingUserReadQueue = Promise.resolve()

export async function withMissingTestPrivateUserRead<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  assert(!missingUserReadContext.getStore()?.active, 'Nested missing-user reads are not supported')
  const previousOperation = missingUserReadQueue
  let releaseOperation!: () => void
  missingUserReadQueue = new Promise(resolve => {
    releaseOperation = resolve
  })
  await previousOperation
  try {
    return await runWithMissingTestPrivateUserRead(operation)
  } finally {
    releaseOperation()
  }
}

async function runWithMissingTestPrivateUserRead<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  const context: MissingUserReadContext = { active: true, interceptions: 0 }
  const queryDescriptor = Object.getOwnPropertyDescriptor(readPool, 'query')
  const originalQuery = readPool.query
  Object.defineProperty(readPool, 'query', {
    configurable: true,
    enumerable: true,
    value: wrapReadQuery(originalQuery, context),
    writable: true,
  })

  try {
    return await missingUserReadContext.run(context, operation)
  } finally {
    context.active = false
    if (queryDescriptor) Object.defineProperty(readPool, 'query', queryDescriptor)
    else Reflect.deleteProperty(readPool, 'query')
    assert.equal(context.interceptions, 1, 'Expected exactly one test private-user read')
  }
}

function wrapReadQuery(
  query: pg.Pool['query'],
  expectedContext: MissingUserReadContext,
): pg.Pool['query'] {
  return ((...args: unknown[]) => {
    const input = args[0]
    const text =
      typeof input === 'string'
        ? input
        : typeof input === 'object' && input !== null && 'text' in input
          ? String(input.text)
          : ''
    const activeContext = missingUserReadContext.getStore()
    if (
      activeContext === expectedContext &&
      expectedContext.active &&
      text.includes('/* getTestPrivateUserById */')
    ) {
      expectedContext.interceptions += 1
      return Promise.resolve({ command: 'SELECT', fields: [], oid: 0, rowCount: 0, rows: [] })
    }
    return Reflect.apply(query, readPool, args)
  }) as unknown as pg.Pool['query']
}
