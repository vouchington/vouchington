import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { emails, isDispatcherJob, processEmailJob } from './workers.mts'

describe('emails worker router', () => {
  afterAll(async () => {
    await emails.close()
  })

  it('identifies dispatcher jobs', () => {
    expect(isDispatcherJob('dispatchEngagementEmails')).toBe(true)
    expect(isDispatcherJob('dispatchCommunityModerationSummaryEmails')).toBe(true)
    expect(isDispatcherJob('processSendFollowTopicsEmail')).toBe(false)
  })

  it('runs dispatcher jobs through the worker router', async () => {
    const dispatchEngagementEmails = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const dispatchCommunityModerationSummaryEmails = vi.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    )
    const dispatchers = {
      dispatchEngagementEmails,
      dispatchCommunityModerationSummaryEmails,
    }

    await expect(
      processEmailJob({ name: 'dispatchEngagementEmails' } as Job, dispatchers),
    ).resolves.toBeUndefined()
    await expect(
      processEmailJob({ name: 'dispatchCommunityModerationSummaryEmails' } as Job, dispatchers),
    ).resolves.toBeUndefined()
    expect(dispatchEngagementEmails).toHaveBeenCalledOnce()
    expect(dispatchCommunityModerationSummaryEmails).toHaveBeenCalledOnce()
  })
})
