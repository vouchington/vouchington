import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestRetentionWindow,
  createTestUserDirect,
  getTestUserRaw,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { getTestMembershipRaw } from '@voucha/test-helpers/entities/memberships-read'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { claimAdministratorRefundRequest } from '../../memberships/refund-reconciliation/administrator-request.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

describe('final purge and an administrator refund admitted after the eligibility read', () => {
  it('defers the purge and keeps the account and its membership', async () => {
    const window = createTestRetentionWindow()
    const [administrator, member] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const membership = await createTestMembership({
      user_id: member.id,
      stripe_subscription_id: `sub-purge-refund-race-${randomUUID()}`,
    })
    await softDeleteUserAt(member.id, window.firstEligibleDate)
    const request = {
      amount: { amount: 700, currency: 'usd' as const },
      cancelRequested: false,
      idempotencyKey: randomUUID(),
      issuedById: administrator.id,
      membershipId: membership.id,
      note: null,
      periodEndsAt: new Date('2026-10-01T00:00:00.000Z'),
      periodStartedAt: new Date('2026-09-01T00:00:00.000Z'),
      providerPaymentReference: `ch-purge-refund-race-${randomUUID()}`,
      providerSubscriptionReference: null,
      reason: 'requested' as const,
      requestFingerprint: randomUUID().replaceAll('-', '').repeat(2),
    }

    const restore = afterPostgresTransactionQueryForTest(
      'cleanupSoftDeletedUserBatch: check target',
      values => values.includes(member.id),
      async () => {
        await claimAdministratorRefundRequest(request)
      },
    )
    let result: Awaited<ReturnType<typeof cleanupSoftDeletedUser>>
    try {
      result = await cleanupSoftDeletedUser(member.id, window.upperBoundDate)
    } finally {
      restore()
    }

    expect(result).toEqual({ deleted: 0, hasMore: true })
    expect(await getTestUserRaw(member.id)).not.toBeNull()
    expect(await getTestMembershipRaw(membership.id)).toBeDefined()
    await expect(claimAdministratorRefundRequest(request)).resolves.toMatchObject({
      completed: false,
    })
  })
})
