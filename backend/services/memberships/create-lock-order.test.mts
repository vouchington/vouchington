import { describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  beginTransaction,
} from '@voucha/test-helpers'
import { grantMembership } from './create.mts'

describe('createMembership lock order', () => {
  it('locks the user before waiting on the current projection', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const membership = await createTestMembership({ user_id: member.id })
    const sku = await createTestSku({ plan: 'pro' })
    const projectionLocked = Promise.withResolvers<void>()
    const releaseProjection = Promise.withResolvers<void>()
    const holder = holdMembershipProjectionLock(membership.id, projectionLocked, releaseProjection)
    await projectionLocked.promise

    const creation = grantMembership(admin.id, member.id, 'pro', sku.id, 30)
    try {
      await vi.waitFor(async () => {
        await expect(attemptUserLock(member.id)).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseProjection.resolve()
    }
    await holder
    await expect(creation).resolves.toMatchObject({ queued: true })
  })
})

async function holdMembershipProjectionLock(
  membershipId: string,
  projectionLocked: PromiseWithResolvers<void>,
  releaseProjection: PromiseWithResolvers<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(`SELECT id FROM memberships WHERE id = $1::uuid FOR UPDATE`, [membershipId])
  projectionLocked.resolve()
  await releaseProjection.promise
  await transaction.commit()
}

async function attemptUserLock(userId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(`SET LOCAL lock_timeout = '50ms'`)
  await transaction(`SELECT id FROM users WHERE id = $1::uuid FOR UPDATE`, [userId])
  await transaction.commit()
}
