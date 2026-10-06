import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readAllQueueJobs } from '@voucha/test-helpers'
import * as unfurlEnqueues from '@queues/unfurl-referral-links/enqueues'
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
    should_cancel_at_period_end: false,
    ...overrides,
  }
}

function jobUserId(job: { data: unknown }): string | undefined {
  return (job.data as { userId?: string } | null)?.userId
}

function captureChildRemovalJobs(): Promise<unknown>[] {
  const pending: Promise<unknown>[] = []
  const enqueue = unfurlEnqueues.enqueueRemoveUnfurledChildrenForUser
  vi.spyOn(unfurlEnqueues, 'enqueueRemoveUnfurledChildrenForUser').mockImplementation(userId => {
    const job = enqueue(userId)
    pending.push(job)
    return job
  })
  return pending
}

describe('enqueueUnfurledChildRemovalOnDowngrade', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['cancelled', 'expired', 'paused'] as const)(
    'enqueues removal for current.user_id when an active plus-tier membership becomes %s',
    async status => {
      const userId = randomUUID()
      const membership: MembershipUpdateResult = {
        previous: buildLifecycleFields({ user_id: userId, status: 'active' }),
        current: buildLifecycleFields({ user_id: userId, status }),
      }
      const pending = captureChildRemovalJobs()

      enqueueUnfurledChildRemovalOnDowngrade(membership)
      await Promise.all(pending)

      const jobs = await readAllQueueJobs(unfurlReferralLinksQueue)
      expect(jobs.filter(job => jobUserId(job) === userId)).toHaveLength(1)
    },
  )

  it('does not enqueue when a free-equivalent (cancelled) membership becomes active plus', async () => {
    const userId = randomUUID()
    const membership: MembershipUpdateResult = {
      previous: buildLifecycleFields({ user_id: userId, status: 'cancelled' }),
      current: buildLifecycleFields({ user_id: userId, status: 'active' }),
    }
    const pending = captureChildRemovalJobs()

    enqueueUnfurledChildRemovalOnDowngrade(membership)

    expect(pending).toHaveLength(0)
  })

  it('does not enqueue when an active plus-tier membership has no tier change', async () => {
    const userId = randomUUID()
    const membership: MembershipUpdateResult = {
      previous: buildLifecycleFields({ user_id: userId, status: 'active' }),
      current: buildLifecycleFields({ user_id: userId, status: 'active' }),
    }
    const pending = captureChildRemovalJobs()

    enqueueUnfurledChildRemovalOnDowngrade(membership)

    expect(pending).toHaveLength(0)
  })

  it('does not enqueue when a terminal projection yields an active paid grant', async () => {
    const userId = randomUUID()
    const membership: MembershipUpdateResult = {
      previous: buildLifecycleFields({ user_id: userId, status: 'active' }),
      current: buildLifecycleFields({ user_id: userId, status: 'cancelled' }),
    }
    const pending = captureChildRemovalJobs()

    enqueueUnfurledChildRemovalOnDowngrade(membership, true)

    expect(pending).toHaveLength(0)
  })
})
