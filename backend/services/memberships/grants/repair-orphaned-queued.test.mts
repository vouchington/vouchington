import { beginTransaction } from '@data-stores/psql'
import {
  createTestSku,
  createTestUser,
  getTestMembershipGrant,
  getTestMembershipRaw,
  holdUncommittedQueuedMembershipGrant,
  insertQueuedMembershipGrant,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { getMembershipByUserId } from '../get.mts'
import { grantMembership } from '../grant.mts'
import {
  activateOrphanedQueuedGrant,
  repairOrphanedQueuedGrantsBatch,
} from './repair-orphaned-queued.mts'
import { revokeMembershipGrant } from './revoke.mts'

describe('repairOrphanedQueuedGrantsBatch', () => {
  it('activates a queued grant that committed after its covering grant was revoked', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const activeSku = await createTestSku({ plan: 'plus' })
    const queuedSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const active = await grantMembership(admin.id, member.id, 'plus', activeSku.id, 30)
    const held = await holdUncommittedQueuedMembershipGrant({
      userId: member.id,
      productId: queuedSku.id,
      grantedById: admin.id,
    })

    const revoked = await revokeMembershipGrant(admin.id, active.grantId, 'coverage ended')

    expect(revoked).toMatchObject({ activatedNextGrant: false, alreadyRevoked: false })
    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
    await held.release()

    await expect(repairOrphanedQueuedGrantsBatch(null, 10, [member.id])).resolves.toEqual({
      repaired: 1,
      hasMore: false,
      nextCursor: member.id,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
    })
    await expect(getTestMembershipRaw(active.id)).resolves.toMatchObject({
      projection_ended_at: expect.any(Date),
      status: 'cancelled',
    })
    await expect(getTestMembershipGrant(held.grantId)).resolves.toMatchObject({
      activation_started_at: expect.any(Date),
      activation_ended_at: null,
    })
  })

  it('leaves a queued grant behind an active projection', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const activeSku = await createTestSku({ plan: 'plus' })
    const queuedSku = await createTestSku({ plan: 'pro' })
    const active = await grantMembership(admin.id, member.id, 'plus', activeSku.id, 30)
    const queuedGrantId = await insertQueuedMembershipGrant({
      userId: member.id,
      productId: queuedSku.id,
      grantedById: admin.id,
    })

    await using query = await beginTransaction()
    await expect(activateOrphanedQueuedGrant(member.id, query)).resolves.toBeNull()
    await query.commit()
    await expect(repairOrphanedQueuedGrantsBatch(null, 10, [member.id])).resolves.toMatchObject({
      repaired: 0,
      hasMore: false,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      id: active.id,
      plan: 'plus',
      status: 'active',
    })
    await expect(getTestMembershipGrant(queuedGrantId)).resolves.toMatchObject({
      activation_started_at: null,
    })
  })

  it('repairs one orphan per page and reports another page', async () => {
    const admin = await createTestUser({ administrator: true })
    const first = await createTestUser()
    const second = await createTestUser()
    const [lower, higher] = [first, second].toSorted((left, right) => (left.id < right.id ? -1 : 1))
    const higherGrantId = await createOrphanedQueuedGrant(admin.id, higher.id)
    await createOrphanedQueuedGrant(admin.id, lower.id)

    const page = await repairOrphanedQueuedGrantsBatch(null, 1, [lower.id, higher.id])

    expect(page).toEqual({ repaired: 1, hasMore: true, nextCursor: lower.id })
    await expect(getMembershipByUserId(lower.id)).resolves.toMatchObject({ status: 'active' })
    await expect(getTestMembershipGrant(higherGrantId)).resolves.toMatchObject({
      activation_started_at: null,
    })
    await expect(
      repairOrphanedQueuedGrantsBatch(page.nextCursor, 1, [lower.id, higher.id]),
    ).resolves.toMatchObject({ repaired: 1, nextCursor: higher.id })
    await expect(getMembershipByUserId(higher.id)).resolves.toMatchObject({ status: 'active' })
  })
})

async function createOrphanedQueuedGrant(adminId: string, userId: string): Promise<string> {
  const activeSku = await createTestSku({ plan: 'plus' })
  const queuedSku = await createTestSku({ plan: 'pro' })
  const active = await grantMembership(adminId, userId, 'plus', activeSku.id, 30)
  const revoked = await revokeMembershipGrant(adminId, active.grantId, 'coverage ended')
  expect(revoked).toMatchObject({ activatedNextGrant: false })
  return insertQueuedMembershipGrant({
    userId,
    productId: queuedSku.id,
    grantedById: adminId,
  })
}
