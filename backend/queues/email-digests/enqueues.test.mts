import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB } from '@queues/background/enqueues/email-digests-jobs'
import { background } from '@queues/background/queues'
import { ENGAGEMENT_DISPATCH_ORDERING } from '@queues/background/enqueues/email-digests-domain'
import {
  enqueueDispatchEngagementEmails,
  enqueueEngagementDispatchContinuation,
  enqueuePageFollowNewsSourcesEmail,
  enqueuePageFollowTopicsEmail,
} from './enqueues.mts'
import { scheduledJobManifest } from './enqueues/schedules.mts'

describe('engagement dispatch singleton admission', () => {
  it('admits claimed topic and source sends under stable page identities', async () => {
    const userId = randomUUID()
    const claimOwnerJobId = `engagement-page-${randomUUID()}`
    const topicJobId = `engagement-send-topic-${randomUUID()}`
    const sourceJobId = `engagement-send-source-${randomUUID()}`
    const input = { userId, claimOwnerJobId }
    try {
      await enqueuePageFollowTopicsEmail(
        input,
        {
          topics: [{ name: 'A topic', url: 'https://example.com/topic/a-topic' }],
          settingsUrl: 'https://example.com/my/topics/following',
          unsubscribeUrl: 'https://example.com/my/notification-settings',
        },
        topicJobId,
      )
      await enqueuePageFollowNewsSourcesEmail(
        input,
        {
          sources: [{ name: 'A source', url: 'https://example.com/source/a-source' }],
          settingsUrl: 'https://example.com/my/news-sources',
          unsubscribeUrl: 'https://example.com/my/notification-settings',
        },
        sourceJobId,
      )
      expect((await background.getJob(topicJobId))?.data).toMatchObject({
        input,
        variables: { topics: [{ name: 'A topic' }] },
      })
      expect((await background.getJob(sourceJobId))?.data).toMatchObject({
        input,
        variables: { sources: [{ name: 'A source' }] },
      })
    } finally {
      await (await background.getJob(topicJobId))?.remove()
      await (await background.getJob(sourceJobId))?.remove()
    }
  })

  it('uses one lane for manual, scheduled, and continued pages', async () => {
    const ordering = { ...ENGAGEMENT_DISPATCH_ORDERING, concurrency: 1 }
    expect(EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB.options.ordering).toEqual(ordering)
    const direct = await enqueueDispatchEngagementEmails()
    expect(direct).toMatchObject({
      name: EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB.name,
      opts: { ordering },
    })

    const scheduled = scheduledJobManifest.jobs.find(
      job => job.schedulerId === 'email-digests-engagement',
    )
    const schedulerOptions =
      typeof scheduled?.template.opts === 'function'
        ? scheduled.template.opts()
        : scheduled?.template.opts
    expect(schedulerOptions?.ordering).toEqual(ordering)
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
      opts: { ordering },
    })
  })
})
