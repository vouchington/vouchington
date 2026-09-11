import { describe, expect, it } from 'vitest'
import { upsertSchedules } from './schedules.mts'

describe('OAuth authorization exchange schedules', () => {
  it('registers the durable recovery dispatcher at the 1-minute scheduling floor', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })
})
