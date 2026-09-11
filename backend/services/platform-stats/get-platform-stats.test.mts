import { describe, it, expect } from 'vitest'
import { getPlatformStats } from './get-platform-stats.mts'

describe('getPlatformStats', () => {
  it('should return all count fields as non-negative integers', async () => {
    const stats = await getPlatformStats()

    expect(stats.topic_count).toBeTypeOf('number')
    expect(stats.rss_feed_count).toBeTypeOf('number')
    expect(stats.post_count).toBeTypeOf('number')
    expect(stats.review_count).toBeTypeOf('number')
    expect(stats.data_point_count).toBeTypeOf('number')
    expect(stats.hostname_count).toBeTypeOf('number')

    expect(stats.topic_count).toBeGreaterThanOrEqual(0)
    expect(stats.rss_feed_count).toBeGreaterThanOrEqual(0)
    expect(stats.post_count).toBeGreaterThanOrEqual(0)
    expect(stats.review_count).toBeGreaterThanOrEqual(0)
    expect(stats.data_point_count).toBeGreaterThanOrEqual(0)
    expect(stats.hostname_count).toBeGreaterThanOrEqual(0)
  })

  it('should return consistent counts (review + data_point <= post)', async () => {
    const stats = await getPlatformStats()
    expect(stats.review_count + stats.data_point_count).toBeLessThanOrEqual(stats.post_count)
  })
})
