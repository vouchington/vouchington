import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { inspectFutureReportingSourceDays } from '@voucha/test-helpers/reporting-daily-rollups'
import { recomputeReportingDay, materializeReportingDays } from './recompute.mts'

describe('reporting initialization boundaries', () => {
  it('keeps the next source day at today when the remaining workload source is future-dated', async () => {
    const actor = await createTestUser()
    const community = await insertTestCommunity({ createdById: actor.id })
    const result = await inspectFutureReportingSourceDays(actor.id, community.id)
    expect(result.growth).toBe(result.today)
    expect(result.workload).toBe(result.today)
  })

  it('does not materialize a future day as completed history', async () => {
    await expect(recomputeReportingDay('growth', '3000-01-01')).resolves.toBeUndefined()
    await expect(recomputeReportingDay('moderator_workload', '3000-01-01')).resolves.toBeUndefined()
  })
})

describe('reporting bootstrap idempotence', () => {
  it('returns caught-up results on repeated bootstrap calls with an epoch boundary', async () => {
    for (const kind of ['growth', 'moderator_workload'] as const) {
      const first = await materializeReportingDays(kind, new Date(0))
      const repeated = await materializeReportingDays(kind, new Date(0))
      expect(first.hasMore).toBe(false)
      expect(repeated.hasMore).toBe(false)
      expect(first.nextDay).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(first.nextDay.localeCompare('1970-01-01')).toBeGreaterThanOrEqual(0)
      expect(repeated.nextDay.localeCompare(first.nextDay)).toBeGreaterThanOrEqual(0)
    }
  })
})
