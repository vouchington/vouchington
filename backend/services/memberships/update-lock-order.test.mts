import { describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  holdTestMembershipRowLock,
  holdTestMembershipSourceStateLock,
  probeTestUserLock,
} from '@voucha/test-helpers'
import { updateMembershipFromEvent } from './update.mts'

async function updateWithoutRecording(options: Parameters<typeof updateMembershipFromEvent>[0]) {
  return await updateMembershipFromEvent(options, async () => {})
}

describe('updateMembershipFromEvent lock order', () => {
  it('locks the owning user before waiting on the membership row', async () => {
    const lockUser = await createTestUser()
    const membership = await createTestMembership({ user_id: lockUser.id })
    const membershipLocked = Promise.withResolvers<void>()
    const releaseMembership = Promise.withResolvers<void>()
    const holder = holdTestMembershipRowLock(membership.id, membershipLocked, releaseMembership)
    await membershipLocked.promise

    const update = updateWithoutRecording({ membershipId: membership.id, status: 'past_due' })
    try {
      await vi.waitFor(async () => {
        await expect(probeTestUserLock(lockUser.id)).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseMembership.resolve()
    }
    await holder
    await expect(update).resolves.toMatchObject({ current: { status: 'past_due' } })
  })

  it('locks the owning user before waiting on a detached source state', async () => {
    const lockUser = await createTestUser()
    const membership = await createTestMembership({ user_id: lockUser.id })
    const sourceLocked = Promise.withResolvers<void>()
    const releaseSource = Promise.withResolvers<void>()
    const holder = holdTestMembershipSourceStateLock(
      membership.membership_source_id,
      sourceLocked,
      releaseSource,
    )
    await sourceLocked.promise

    const update = updateWithoutRecording({
      membershipId: membership.id,
      membershipSourceId: membership.membership_source_id,
      status: 'cancelled',
    })
    try {
      await vi.waitFor(async () => {
        await expect(probeTestUserLock(lockUser.id)).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseSource.resolve()
    }
    await holder
    await expect(update).resolves.toMatchObject({ current: { status: 'cancelled' } })
  })
})
