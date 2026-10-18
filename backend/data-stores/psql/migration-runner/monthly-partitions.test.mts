import { describe, expect, it } from 'vitest'
import type { QueryExecutor } from '../types.mts'
import { createMonthlyPartitions } from './monthly-partitions.mts'

describe('createMonthlyPartitions', () => {
  it('creates the configured monthly partitions without dropping the RSS default child', async () => {
    const statements: string[] = []
    const writer = recordStatements(statements)

    await createMonthlyPartitions(writer)

    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain('CREATE')
  })
})

function recordStatements(statements: string[]): QueryExecutor {
  return async input => {
    statements.push(typeof input === 'string' ? input : input.text)
    return { rows: [], rowCount: 0, command: 'CREATE', oid: 0, fields: [] }
  }
}
