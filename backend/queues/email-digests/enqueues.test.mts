import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB } from '@queues/background/enqueues/email-digests-jobs'
import { ENGAGEMENT_DISPATCH_ORDERING } from './config.mts'
import {
  enqueueDispatchEngagementEmails,
  enqueueEngagementDispatchContinuation,
} from './enqueues.mts'
import { scheduledJobManifest } from './enqueues/schedules.mts'

describe('engagement dispatch singleton admission', () => {
  it('uses one lane for manual, scheduled, and continued pages', async () => {
    const direct = await enqueueDispatchEngagementEmails()
    expect(direct).toMatchObject({
      name: EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB.name,
      opts: { ordering: ENGAGEMENT_DISPATCH_ORDERING },
    })

    const scheduled = scheduledJobManifest.jobs.find(
      job => job.schedulerId === 'email-digests-engagement',
    )
    const schedulerOptions =
      typeof scheduled?.template.opts === 'function'
        ? scheduled.template.opts()
        : scheduled?.template.opts
    expect(schedulerOptions?.ordering).toEqual(ENGAGEMENT_DISPATCH_ORDERING)
    expect(scheduled?.operatorSurfaces[0]).toMatchObject({
      trigger: enqueueDispatchEngagementEmails,
    })

    const continued = await enqueueEngagementDispatchContinuation(
      {
        phase: 'post_referral_link',
        cursor: { lane: 'unclaimed', afterUserId: randomUUID() },
        dispatchStartedAt: new Date().toISOString(),
        remainingBudget: 1,
      },
      {
        jobId: `engagement-continuation-${randomUUID()}`,
        ordering: { key: 'wrong-lane', concurrency: 5 },
      },
    )
    expect(continued).toMatchObject({
      name: EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB.name,
      opts: { ordering: ENGAGEMENT_DISPATCH_ORDERING },
    })
  })
})
