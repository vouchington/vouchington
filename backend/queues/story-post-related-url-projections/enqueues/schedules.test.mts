import { describe, expect, it } from 'vitest'
import { scheduledJobManifest } from './schedules.mts'

describe('story post related URL projection schedules', () => {
  it('registers the five-minute durable recovery schedule on the background queue', () => {
    expect(scheduledJobManifest.queueName).toBe('background')
    expect(scheduledJobManifest.jobs[0]).toMatchObject({
      schedulerId: 'reconcileStoryPostRelatedUrlProjections',
      repeat: { every: 300_000 },
      template: { name: 'story-post-related-url-projections.reconcile' },
    })
  })

  it('keeps recovery serialized by the domain group without scheduler-template deduplication', () => {
    const opts = scheduledJobManifest.jobs[0]?.template.opts
    expect(opts).toMatchObject({
      priority: 100,
      ordering: { key: 'story-post-related-url-projections', concurrency: 1 },
    })
    // glide-mq rejects `deduplication` on scheduler templates; the scheduler id already keeps one
    // recovery schedule, and the domain ordering key serializes the runs.
    expect(opts).not.toHaveProperty('deduplication')
  })
})
