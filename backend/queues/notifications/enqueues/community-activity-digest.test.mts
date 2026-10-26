import { describe, expect, it } from 'vitest'
import { getCommunityActivityDigestDispatchData } from './community-activity-digest.mts'
import { scheduledJobManifest } from './schedules.mts'

describe('community activity digest schedule', () => {
  it('selects the previous closed UTC week', () => {
    expect(getCommunityActivityDigestDispatchData(new Date('2026-07-15T18:42:00.000Z'))).toEqual({
      windowStart: '2026-07-06T00:00:00.000Z',
      windowEnd: '2026-07-13T00:00:00.000Z',
    })
  })

  it('runs the Monday UTC schedule tick through background', () => {
    const tick = scheduledJobManifest.jobs.find(
      job => job.schedulerId === 'community-activity-digest-weekly',
    )
    expect(scheduledJobManifest.queueName).toBe('background')
    expect(tick?.repeat).toEqual({ pattern: '0 9 * * 1' })
    expect(tick?.template.name).toBe('notifications.processCommunityActivityDigestScheduleTick')
  })
})
