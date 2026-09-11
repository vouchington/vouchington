import { describe, expect, it } from 'vitest'
import { scheduledJobManifest, upsertSchedules } from './schedules.mts'

describe('story post related URL projection schedules', () => {
  it('registers the five-minute durable recovery schedule', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })

  it('keeps recovery globally serialized and throttle-deduplicated', () => {
    expect(scheduledJobManifest.jobs[0]?.template.opts).toMatchObject({
      priority: 100,
      ordering: { key: 'story-post-related-url-projections', concurrency: 1 },
      deduplication: {
        id: 'story-post-related-url-projections:reconcile',
        mode: 'throttle',
        ttl: 60_000,
      },
    })
  })
})
