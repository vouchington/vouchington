import { describe, it, expect } from 'vitest'
import { upsertSchedules } from './schedules.mts'

describe('psql schedules', () => {
  it('registers the psql schedulers (incl. RSS crawl-tier refresh) without throwing', async () => {
    await expect(upsertSchedules()).resolves.not.toThrow()
  })
})
