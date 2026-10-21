import { observeTestPostgresQueryPools } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { readClassifierUsageReport } from './usage-report.mts'

describe('classifier usage report reader', () => {
  it('reads the closed window from the replica and does not query the writer', async () => {
    const observed = await observeTestPostgresQueryPools('readClassifier', () =>
      readClassifierUsageReport({
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: new Date('2026-01-02T00:00:00.000Z'),
      }),
    )

    expect(observed.pools).toEqual(['read'])
    expect(observed.result.runs).toEqual([])
  })
})
