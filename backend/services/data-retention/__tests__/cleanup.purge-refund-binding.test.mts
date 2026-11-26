import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestRetentionWindow,
  createTestUserDirect,
  deleteTestMembershipProjectionForRefundSource,
  getTestUserRaw,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { cleanupRefundReconciliationOperationsForTest } from '../../../test-helpers/entities/membership-refund-reconciliation-state.mts'
import { claimAdministratorRefundRequest } from '../../memberships/refund-reconciliation/administrator-request.mts'
import { cleanupSoftDeletedUserBatch } from '../cleanup-batches.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

async function createAccountWithIncompleteRefundAndNoMembership() {
  const window = createTestRetentionWindow()
  const [administrator, member] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const membership = await createTestMembership({
    user_id: member.id,
    stripe_subscription_id: `sub-purge-refund-binding-${randomUUID()}`,
  })
  const operation = await claimAdministratorRefundRequest({
    amount: { amount: 700, currency: 'usd' as const },
    cancelRequested: false,
    idempotencyKey: randomUUID(),
    issuedById: administrator.id,
    membershipId: membership.id,
    note: null,
    periodEndsAt: new Date('2026-10-01T00:00:00.000Z'),
    periodStartedAt: new Date('2026-09-01T00:00:00.000Z'),
    providerPaymentReference: `ch-purge-refund-binding-${randomUUID()}`,
    providerSubscriptionReference: null,
    reason: 'requested' as const,
    requestFingerprint: randomUUID().replaceAll('-', '').repeat(2),
  })
  await deleteTestMembershipProjectionForRefundSource(membership.membership_source_id)
  await softDeleteUserAt(member.id, window.firstEligibleDate)
  return { window, member, operation }
}

describe('final purge of an account whose membership row is gone but whose refund is incomplete', () => {
  it('is not discovered until the refund operation completes', async () => {
    const { window, member, operation } = await createAccountWithIncompleteRefundAndNoMembership()

    await expect(
      cleanupSoftDeletedUserBatch(window.upperBoundDate, 10, undefined, undefined, [member.id]),
    ).resolves.toEqual({ deleted: 0, hasMore: false })
    expect(await getTestUserRaw(member.id)).not.toBeNull()

    await cleanupRefundReconciliationOperationsForTest([operation.id])

    await expect(
      cleanupSoftDeletedUserBatch(window.upperBoundDate, 10, undefined, undefined, [member.id]),
    ).resolves.toMatchObject({ deleted: 1 })
    expect(await getTestUserRaw(member.id)).toBeNull()
  })

  it('is not eligible until the refund operation completes', async () => {
    const { window, member, operation } = await createAccountWithIncompleteRefundAndNoMembership()

    await expect(cleanupSoftDeletedUser(member.id, window.upperBoundDate)).resolves.toEqual({
      deleted: 0,
      hasMore: false,
    })
    expect(await getTestUserRaw(member.id)).not.toBeNull()

    await cleanupRefundReconciliationOperationsForTest([operation.id])

    await expect(cleanupSoftDeletedUser(member.id, window.upperBoundDate)).resolves.toMatchObject({
      deleted: 1,
      hasMore: false,
    })
    expect(await getTestUserRaw(member.id)).toBeNull()
  })
})
