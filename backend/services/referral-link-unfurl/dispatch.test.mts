import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestReferralProgram,
  createTestUrlWithHostname,
  insertTestUserReferralProgramLink,
} from '@voucha/test-helpers'
import {
  markReferralLinkUnfurlRequested,
  markReferralLinkUnfurlCompleted,
  markReferralLinkUnfurlFailed,
} from '@services/user-referral-program-links/unfurl-state'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import { dispatchUnfurlReferralLinks } from './dispatch.mts'

function jobParentLinkId(job: { data: unknown }): string | undefined {
  return (job.data as { parentLinkId?: string } | null)?.parentLinkId
}

describe('dispatchUnfurlReferralLinks', () => {
  let userId: string
  let referralProgramId: string

  beforeAll(async () => {
    const user = await createTestUserDirect()
    userId = user!.id
    referralProgramId = await insertTestReferralProgram({ createdById: userId })
  })

  async function createLink(): Promise<string> {
    const urlId = await createTestUrlWithHostname()
    return insertTestUserReferralProgramLink({ userId, referralProgramId, urlId })
  }

  it('enqueues the requested-only link, skipping completed/failed/never-requested links', async () => {
    const requestedOnly = await createLink()
    await markReferralLinkUnfurlRequested(requestedOnly)

    const requestedAndCompleted = await createLink()
    await markReferralLinkUnfurlRequested(requestedAndCompleted)
    await markReferralLinkUnfurlCompleted(requestedAndCompleted)

    const requestedAndFailed = await createLink()
    await markReferralLinkUnfurlRequested(requestedAndFailed)
    await markReferralLinkUnfurlFailed(requestedAndFailed, 'sentinel failure')

    const neverRequested = await createLink()

    const totalEnqueued = await dispatchUnfurlReferralLinks()
    expect(totalEnqueued).toBeGreaterThanOrEqual(1)

    const jobs = await unfurlReferralLinksQueue.getJobs('waiting')
    const enqueuedLinkIds = new Set(jobs.map(jobParentLinkId))

    expect(enqueuedLinkIds.has(requestedOnly)).toBe(true)
    expect(enqueuedLinkIds.has(requestedAndCompleted)).toBe(false)
    expect(enqueuedLinkIds.has(requestedAndFailed)).toBe(false)
    expect(enqueuedLinkIds.has(neverRequested)).toBe(false)
  })
})
