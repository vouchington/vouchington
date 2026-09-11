import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { waitForQueueJobs } from '@voucha/test-helpers'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import type { MembershipLifecycleFields, MembershipUpdateResult } from './update-result.mts'
import { enqueueUnfurledChildRemovalOnDowngrade } from './paid-tier-downgrade.mts'

function buildLifecycleFields(
  overrides: Partial<MembershipLifecycleFields> & { user_id: string },
): MembershipLifecycleFields {
  return {
    plan: 'plus',
    sku_id: randomUUID(),
    status: 'active',
    expires_at: null,
    cancelled_at: null,
    expired_at: null,
    past_due_at: null,
    paused_at: null,
    cancel_at_period_end: false,
    ...overrides,
  }
}

function jobUserId(job: { data: unknown }): string | undefined {
  return (job.data as { userId?: string } | null)?.userId
}

function findJobsForUser(
  jobs: Awaited<ReturnType<typeof unfurlReferralLinksQueue.getJobs>>,
  userId: string,
) {
  return jobs.filter(job => jobUserId(job) === userId)
}

describe('enqueueUnfurledChildRemovalOnDowngrade', () => {
  it.each(['cancelled', 'expired', 'paused'] as const)(
    'enqueues removal for current.user_id when an active plus-tier membership becomes %s',
    async status => {
      const userId = randomUUID()
      const membership: MembershipUpdateResult = {
        previous: buildLifecycleFields({ user_id: userId, status: 'active' }),
        current: buildLifecycleFields({ user_id: userId, status }),
      }

      enqueueUnfurledChildRemovalOnDowngrade(membership)

      const jobs = await waitForQueueJobs(
        unfurlReferralLinksQueue,
        jobs => findJobsForUser(jobs, userId).length > 0,
      )
      const matchingJobs = findJobsForUser(jobs, userId)

      expect(matchingJobs).toHaveLength(1)
    },
  )

  it('does not enqueue when a free-equivalent (cancelled) membership becomes active plus', async () => {
    const userId = randomUUID()
    const membership: MembershipUpdateResult = {
      previous: buildLifecycleFields({ user_id: userId, status: 'cancelled' }),
      current: buildLifecycleFields({ user_id: userId, status: 'active' }),
    }

    enqueueUnfurledChildRemovalOnDowngrade(membership)

    const jobs = await waitForQueueJobs(
      unfurlReferralLinksQueue,
      jobs => findJobsForUser(jobs, userId).length > 0,
      200,
    )
    expect(findJobsForUser(jobs, userId)).toHaveLength(0)
  })

  it('does not enqueue when an active plus-tier membership has no tier change', async () => {
    const userId = randomUUID()
    const membership: MembershipUpdateResult = {
      previous: buildLifecycleFields({ user_id: userId, status: 'active' }),
      current: buildLifecycleFields({ user_id: userId, status: 'active' }),
    }

    enqueueUnfurledChildRemovalOnDowngrade(membership)

    const jobs = await waitForQueueJobs(
      unfurlReferralLinksQueue,
      jobs => findJobsForUser(jobs, userId).length > 0,
      200,
    )
    expect(findJobsForUser(jobs, userId)).toHaveLength(0)
  })

  it('does not enqueue when a terminal projection yields an active paid grant', async () => {
    const userId = randomUUID()
    const membership: MembershipUpdateResult = {
      previous: buildLifecycleFields({ user_id: userId, status: 'active' }),
      current: buildLifecycleFields({ user_id: userId, status: 'cancelled' }),
    }

    enqueueUnfurledChildRemovalOnDowngrade(membership, true)

    const jobs = await waitForQueueJobs(
      unfurlReferralLinksQueue,
      jobs => findJobsForUser(jobs, userId).length > 0,
      200,
    )
    expect(findJobsForUser(jobs, userId)).toHaveLength(0)
  })
})
