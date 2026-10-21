import { describe, expect, it } from 'vitest'
import type { QueryExecutor } from '../types.mts'
import { createMonthlyPartitions } from './monthly-partitions.mts'

describe('createMonthlyPartitions', () => {
  it('creates the configured monthly partitions without dropping the RSS default child', async () => {
    const statements: string[] = []
    const writer = recordStatements(statements)

    await createMonthlyPartitions(writer)

    expect(statements.some(statement => statement.includes('CREATE'))).toBe(true)
    expect(
      statements.some(statement =>
        statement.includes('DROP TABLE IF EXISTS rss_feed_crawls__default'),
      ),
    ).toBe(false)
  })
})

function recordStatements(statements: string[]): QueryExecutor {
  return async input => {
    statements.push(typeof input === 'string' ? input : input.text)
    return { rows: [], rowCount: 0, command: 'CREATE', oid: 0, fields: [] }
  }
}
