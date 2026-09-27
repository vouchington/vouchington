import { describe, expect, it } from 'vitest'
import { readPostgresParserProbeForTest } from '../../test-helpers/data-stores/psql/query-row-contract.mts'

describe('PostgreSQL query row contract', () => {
  it('retains configured wire-value parsers for a typed read projection', async () => {
    const row = await readPostgresParserProbeForTest()

    expect(row.nullable_text).toBeNull()
    expect(row.numeric_value).toBe(1.25)
    expect(typeof row.numeric_value).toBe('number')
    expect(row.bigint_value).toBe('9223372036854775807')
    expect(row.date_value).toBe('2020-02-03')
  })
})
