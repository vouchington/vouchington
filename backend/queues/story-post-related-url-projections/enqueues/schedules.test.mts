import { describe, expect, it } from 'vitest'
import { scheduledJobManifest, upsertSchedules } from './schedules.mts'

describe('story post related URL projection schedules', () => {
  it('registers the five-minute durable recovery schedule', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })

  it('keeps recovery globally serialized without scheduler-template deduplication', () => {
    const opts = scheduledJobManifest.jobs[0]?.template.opts
    expect(opts).toMatchObject({
      priority: 100,
      ordering: { key: 'story-post-related-url-projections', concurrency: 1 },
    })
    // glide-mq rejects `deduplication` on scheduler templates; the scheduler id already keeps one
    // recovery schedule, and the global ordering key serializes the runs.
    expect(opts).not.toHaveProperty('deduplication')
  })
})
