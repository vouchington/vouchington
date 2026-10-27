import { observeTestPostgresQueryPools } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { readClassifierUsageReport } from './usage-report.mts'

describe('classifier usage report reader', () => {
  it('reads the closed window from the replica and does not query the writer', async () => {
    const from = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000)
    const observed = await observeTestPostgresQueryPools('readClassifier', () =>
      readClassifierUsageReport({
        from,
        to: new Date(from.getTime() + 60 * 60 * 1000),
      }),
    )

    expect(observed.pools).toEqual(['read'])
    expect(observed.result.runs).toEqual([])
  })
})
