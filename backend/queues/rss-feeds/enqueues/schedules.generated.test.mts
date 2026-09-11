import { describe, it, expect } from 'vitest'
import { upsertSchedules } from './schedules.mts'

describe('rss-feeds schedules', () => {
  it('registers the dispatchRssFeeds scheduler without throwing', async () => {
    await expect(upsertSchedules()).resolves.not.toThrow()
  })
})
