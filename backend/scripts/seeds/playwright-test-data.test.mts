import { describe, expect, it, vi } from 'vitest'
import type { QueryExecutor, TransactionQuery } from '@data-stores/psql'
import { createPlaywrightSeedQuery } from './playwright-test-data.mts'

describe('createPlaywrightSeedQuery', () => {
  it('annotates fixture SQL and preserves values and the transaction client', async () => {
    const client = {} as TransactionQuery['client']
    const query = Object.assign(vi.fn<QueryExecutor>().mockResolvedValue(makeEmptyQueryResult()), {
      client,
    }) as unknown as TransactionQuery
    const seedQuery = createPlaywrightSeedQuery(query)

    await seedQuery('SELECT $1::int', [1])

    expect(seedQuery.client).toBe(client)
    expect(query).toHaveBeenCalledWith('/* seedPlaywrightTestData */ SELECT $1::int', [1])
  })

  it('rejects structured statements so an unannotated query cannot bypass the boundary', async () => {
    const query = Object.assign(vi.fn<QueryExecutor>(), {
      client: {} as TransactionQuery['client'],
    }) as unknown as TransactionQuery
    const seedQuery = createPlaywrightSeedQuery(query)

    await expect(seedQuery({} as never)).rejects.toThrow(
      'Playwright seed queries must be SQL strings',
    )
  })
})

function makeEmptyQueryResult(): Awaited<ReturnType<QueryExecutor>> {
  return {
    command: 'SELECT',
    fields: [],
    oid: 0,
    rowCount: 0,
    rows: [],
  }
}
