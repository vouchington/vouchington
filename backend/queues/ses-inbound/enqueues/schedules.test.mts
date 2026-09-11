import { describe, expect, it } from 'vitest'
import { upsertSchedules } from './schedules.mts'

describe('SES inbound schedules', () => {
  it('registers the durable reconciliation scheduler', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })
})
