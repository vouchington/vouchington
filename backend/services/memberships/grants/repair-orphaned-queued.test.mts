import {
  commitMembershipGrantTransaction,
  createTestSku,
  createTestUser,
  getTestMembershipGrant,
  getTestMembershipRaw,
  holdUncommittedQueuedMembershipGrant,
  insertQueuedMembershipGrant,
} from '@voucha/test-helpers'
import { acquireTestPostgresAdvisoryLock } from '../../../test-helpers/postgres-advisory-lock.mts'
import { describe, expect, it } from 'vitest'
import { getMembershipByUserId } from '../get.mts'
import { grantMembership } from '../grant.mts'
import {
  readOrphanedQueuedGrantRepairCursor,
  resumeExpireElapsedMemberships,
  saveOrphanedQueuedGrantRepairCursor,
} from './expire-elapsed-batch.mts'
import {
  activateOrphanedQueuedGrant,
  readOrphanedQueuedGrantUserIds,
  repairOrphanedQueuedGrantsBatch,
} from './repair-orphaned-queued.mts'
import { revokeMembershipGrant } from './revoke.mts'

describe('repairOrphanedQueuedGrantsBatch', () => {
  it('rejects a batch size that is not a positive integer', async () => {
    await expect(repairOrphanedQueuedGrantsBatch(null, 0)).rejects.toThrow(
      'Membership orphan repair batch size must be a positive integer',
    )
    await expect(repairOrphanedQueuedGrantsBatch(null, 1.5)).rejects.toThrow(RangeError)
    await expect(
      commitMembershipGrantTransaction(query => readOrphanedQueuedGrantUserIds(null, 0, query)),
    ).rejects.toThrow(RangeError)
  })

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
    await expect(
      commitMembershipGrantTransaction(query =>
        readOrphanedQueuedGrantUserIds(null, 1, query, [member.id]),
      ),
    ).resolves.toEqual([])
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

    await expect(
      commitMembershipGrantTransaction(query => activateOrphanedQueuedGrant(member.id, query)),
    ).resolves.toBeNull()
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

    // Each user has a revoked covering grant and a later queued grant. The page has to include both.
    const page = await repairOrphanedQueuedGrantsBatch(null, 2, [lower.id, higher.id])

    expect(page).toEqual({ repaired: 1, hasMore: true, nextCursor: lower.id })
    await expect(getMembershipByUserId(lower.id)).resolves.toMatchObject({ status: 'active' })
    await expect(getTestMembershipGrant(higherGrantId)).resolves.toMatchObject({
      activation_started_at: null,
    })
    await expect(
      repairOrphanedQueuedGrantsBatch(page.nextCursor, 2, [lower.id, higher.id]),
    ).resolves.toMatchObject({ repaired: 1, hasMore: false, nextCursor: higher.id })
    await expect(getMembershipByUserId(higher.id)).resolves.toMatchObject({ status: 'active' })
  })

  it('advances past a full page of grant rows when none of them is an orphan', async () => {
    const admin = await createTestUser({ administrator: true })
    const first = await createTestUser()
    const second = await createTestUser()
    const [lower, higher] = [first, second].toSorted((left, right) => (left.id < right.id ? -1 : 1))
    const higherGrantId = await createOrphanedQueuedGrant(admin.id, higher.id)
    const lowerGrantId = await createOrphanedQueuedGrant(admin.id, lower.id)

    const page = await repairOrphanedQueuedGrantsBatch(null, 1, [lower.id, higher.id])

    expect(page).toEqual({ repaired: 0, hasMore: true, nextCursor: lower.id })
    await expect(getTestMembershipGrant(lowerGrantId)).resolves.toMatchObject({
      activation_started_at: null,
    })
    await expect(
      repairOrphanedQueuedGrantsBatch(page.nextCursor, 2, [lower.id, higher.id]),
    ).resolves.toMatchObject({ repaired: 1, hasMore: false, nextCursor: higher.id })
    await expect(getMembershipByUserId(higher.id)).resolves.toMatchObject({ status: 'active' })
    await expect(getTestMembershipGrant(lowerGrantId)).resolves.toMatchObject({
      activation_started_at: null,
    })
    await expect(getTestMembershipGrant(higherGrantId)).resolves.toMatchObject({
      activation_started_at: expect.any(Date),
    })
  })

  it('resumes the orphan repair from the saved cursor and wraps to null', async () => {
    const admin = await createTestUser({ administrator: true })
    const first = await createTestUser()
    const second = await createTestUser()
    const outsider = await createTestUser()
    const [lower, higher] = [first, second].toSorted((left, right) => (left.id < right.id ? -1 : 1))
    const outsiderGrantId = await createOrphanedQueuedGrant(admin.id, outsider.id)
    await createOrphanedQueuedGrant(admin.id, higher.id)
    const lowerGrantId = await createOrphanedQueuedGrant(admin.id, lower.id)
    const owned = [lower.id, higher.id]
    const reservation = await acquireTestPostgresAdvisoryLock({
      namespace: 5_437_076,
      key: 1,
      timeout: '20s',
    })

    try {
      await saveOrphanedQueuedGrantRepairCursor(null)
      const firstPage = await resumeExpireElapsedMemberships(1, owned)

      expect(firstPage.repairNextCursor).toBe(lower.id)
      expect(await readOrphanedQueuedGrantRepairCursor()).toBe(lower.id)
      await expect(getTestMembershipGrant(lowerGrantId)).resolves.toMatchObject({
        activation_started_at: null,
      })
      await expect(getTestMembershipGrant(outsiderGrantId)).resolves.toMatchObject({
        activation_started_at: null,
      })

      const secondPage = await resumeExpireElapsedMemberships(2, owned)

      expect(secondPage.repairNextCursor).toBeNull()
      expect(await readOrphanedQueuedGrantRepairCursor()).toBeNull()
      await expect(getMembershipByUserId(higher.id)).resolves.toMatchObject({ status: 'active' })
      await expect(getTestMembershipGrant(lowerGrantId)).resolves.toMatchObject({
        activation_started_at: null,
      })
      await expect(getTestMembershipGrant(outsiderGrantId)).resolves.toMatchObject({
        activation_started_at: null,
      })

      const wrapped = await resumeExpireElapsedMemberships(1, owned)

      expect(wrapped.repairNextCursor).toBe(lower.id)
      expect(await readOrphanedQueuedGrantRepairCursor()).toBe(lower.id)
    } finally {
      await saveOrphanedQueuedGrantRepairCursor(null)
      await reservation.release()
    }
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
