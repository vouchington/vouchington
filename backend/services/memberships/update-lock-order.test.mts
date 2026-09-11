import { describe, expect, it, vi } from 'vitest'
import { beginTransaction, createTestMembership, createTestUser } from '@voucha/test-helpers'
import { updateMembershipFromWebhook } from './update.mts'

async function updateWithoutRecording(options: Parameters<typeof updateMembershipFromWebhook>[0]) {
  return await updateMembershipFromWebhook(options, async () => {})
}

describe('updateMembershipFromWebhook lock order', () => {
  it('locks the owning user before waiting on the membership row', async () => {
    const lockUser = await createTestUser()
    const membership = await createTestMembership({ user_id: lockUser.id })
    const membershipLocked = Promise.withResolvers<void>()
    const releaseMembership = Promise.withResolvers<void>()
    const holder = holdMembershipRow(membership.id, membershipLocked, releaseMembership)
    await membershipLocked.promise

    const update = updateWithoutRecording({ membershipId: membership.id, status: 'past_due' })
    try {
      await vi.waitFor(async () => {
        await expect(
          probeUserLock(lockUser.id, '/* updateMembershipFromWebhook lock-order user probe */'),
        ).rejects.toMatchObject({ code: '55P03' })
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
    const holder = holdMembershipSource(
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
        await expect(
          probeUserLock(
            lockUser.id,
            '/* updateMembershipFromWebhook detached lock-order user probe */',
          ),
        ).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseSource.resolve()
    }
    await holder
    await expect(update).resolves.toMatchObject({ current: { status: 'cancelled' } })
  })
})

async function holdMembershipRow(
  membershipId: string,
  locked: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* updateMembershipFromWebhook lock-order membership holder */
      SELECT id FROM memberships WHERE id = $1::uuid FOR UPDATE`,
    [membershipId],
  )
  locked.resolve()
  await release.promise
  await query.commit()
}

async function holdMembershipSource(
  sourceId: string,
  locked: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* updateMembershipFromWebhook detached lock-order source holder */
      SELECT membership_source_id FROM membership_source_states
      WHERE membership_source_id = $1::uuid FOR UPDATE`,
    [sourceId],
  )
  locked.resolve()
  await release.promise
  await query.commit()
}

async function probeUserLock(userId: string, comment: string): Promise<void> {
  await using query = await beginTransaction()
  await query(`SET LOCAL lock_timeout = '50ms'`)
  await query(`${comment} SELECT id FROM users WHERE id = $1::uuid FOR UPDATE`, [userId])
  await query.commit()
}
