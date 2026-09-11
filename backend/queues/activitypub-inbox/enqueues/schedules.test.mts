import { describe, expect, it } from 'vitest'
import { upsertSchedules } from './schedules.mts'

describe('ActivityPub inbox schedules', () => {
  it('registers the five-minute durable recovery scheduler', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })
})
