import { describe, expect, it } from 'vitest'
import { upsertSchedules } from './schedules.mts'

describe('heartbeat schedules', () => {
  it('registers the five-minute GlideMQ metrics publisher', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })
})
