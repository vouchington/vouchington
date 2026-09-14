import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  beginTransaction,
  createTestRetentionWindow,
  createTestMembership,
  createTestSku,
  createTestUserDirect,
  getTestMembershipGrant,
  getTestUserRaw,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { DELETED_USER_ID } from '@services/users/constants'
import { v7 } from 'uuid'

import { cleanupSoftDeletedUsers } from '../cleanup.mts'
import { lockEligibleSoftDeletedUserForFinalPurge } from '../cleanup-soft-deleted-user.mts'
import { terminateRetainedMembershipGrants } from '../terminate-retained-membership-grants.mts'
import { createMembership, grantMembership } from '../../memberships/create.mts'
import { expireElapsedMemberships } from '../../memberships/grants/expire-elapsed.mts'
import { revokeMembershipGrant } from '../../memberships/grants/revoke.mts'
import { claimAdministratorRefundRequest } from '../../memberships/refund-reconciliation/administrator-request.mts'

describe('membership lineage retention', () => {
  it('skips an incomplete administrator refund without starving the deletion batch', async () => {
    const window = createTestRetentionWindow()
    const [administrator, refundMember, eligibleMember] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    if (!administrator || !refundMember || !eligibleMember) {
      throw new Error('Failed to create test users')
    }
    const membership = await createTestMembership({
      user_id: refundMember.id,
      stripe_subscription_id: `sub-retention-refund-${randomUUID()}`,
    })
    await claimAdministratorRefundRequest({
      amount: { amount: 700, currency: 'usd' },
      cancelRequested: false,
      idempotencyKey: randomUUID(),
      issuedById: administrator.id,
      membershipId: membership.id,
      note: null,
      periodEndsAt: new Date('2026-10-01T00:00:00.000Z'),
      periodStartedAt: new Date('2026-09-01T00:00:00.000Z'),
      providerPaymentReference: `ch-retention-refund-${randomUUID()}`,
      providerSubscriptionReference: null,
      reason: 'requested',
      requestFingerprint: randomUUID().replaceAll('-', '').repeat(2),
    })
    await Promise.all([
      softDeleteUserAt(refundMember.id, window.firstEligibleDate),
      softDeleteUserAt(eligibleMember.id, window.secondEligibleDate),
    ])

    await expect(
      cleanupSoftDeletedUsers({ ...window, batchSize: 1, maxBatches: 1 }),
    ).resolves.toEqual({ deleted: 1, hasMore: true })
    expect(await getTestUserRaw(refundMember.id)).not.toBeNull()
    expect(await getTestUserRaw(eligibleMember.id)).toBeNull()
  }, 60_000)

  it('terminalizes active and queued grants before concurrent final account deletion', async () => {
    const window = createTestRetentionWindow()
    const [administrator, member] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    if (!administrator || !member) throw new Error('Failed to create test users')
    const [activeSku, queuedSku] = await Promise.all([
      createTestSku({ plan: 'plus' }),
      createTestSku({ plan: 'pro' }),
    ])
    const active = await grantMembership(administrator.id, member.id, 'plus', activeSku.id, 30)
    const queued = await grantMembership(administrator.id, member.id, 'pro', queuedSku.id, 30)

    await softDeleteUserAt(member.id, window.firstEligibleDate)
    const cleanups = await Promise.all([
      cleanupSoftDeletedUsers(window),
      cleanupSoftDeletedUsers(window),
    ])

    expect(cleanups.reduce((count, result) => count + result.deleted, 0)).toBe(1)
    expect(await getTestUserRaw(member.id)).toBeNull()
    const activeGrant = await getTestMembershipGrant(active.grantId)
    const queuedGrant = await getTestMembershipGrant(queued.grantId)
    expect(activeGrant).toMatchObject({
      revoked_by_id: DELETED_USER_ID,
      revocation_reason: 'account_hard_deleted',
      revoked_at: expect.any(Date),
      source_cancelled_at: expect.any(Date),
      activation_started_at: expect.any(Date),
      activation_ended_at: expect.any(Date),
    })
    expect(activeGrant!.activation_ended_at!.getTime()).toBeGreaterThanOrEqual(
      activeGrant!.activation_started_at!.getTime(),
    )
    expect(queuedGrant).toMatchObject({
      revoked_by_id: DELETED_USER_ID,
      revocation_reason: 'account_hard_deleted',
      revoked_at: expect.any(Date),
      source_cancelled_at: expect.any(Date),
      activation_started_at: null,
      activation_ended_at: null,
    })
    await expect(cleanupSoftDeletedUsers(window)).resolves.toEqual({
      deleted: 0,
      hasMore: false,
    })
  }, 60_000)

  it('locks the user before racing a grant lifecycle mutation with final deletion', async () => {
    const window = createTestRetentionWindow()
    const [administrator, member] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    if (!administrator || !member) throw new Error('Failed to create test users')
    const sku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(administrator.id, member.id, 'plus', sku.id, 30)
    await softDeleteUserAt(member.id, window.firstEligibleDate)

    await using purgeQuery = await beginTransaction()
    await expect(
      lockEligibleSoftDeletedUserForFinalPurge(
        purgeQuery,
        member.id,
        window.upperBoundDate,
        window.lowerBoundDate,
      ),
    ).resolves.toBe(true)
    const revocation = revokeMembershipGrant(administrator.id, grant.grantId, 'concurrent cleanup')
    await terminateRetainedMembershipGrants(purgeQuery, member.id)
    await purgeQuery.commit()

    await expect(revocation).resolves.toMatchObject({ alreadyRevoked: true })
    await expect(cleanupSoftDeletedUsers(window)).resolves.toEqual({
      deleted: 1,
      hasMore: false,
    })
  }, 60_000)

  it('preserves an existing terminal grant outcome during final account deletion', async () => {
    const window = createTestRetentionWindow()
    const [administrator, member] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    if (!administrator || !member) throw new Error('Failed to create test users')
    const sku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(administrator.id, member.id, 'plus', sku.id, 30)
    await revokeMembershipGrant(administrator.id, grant.grantId, 'eligibility corrected')
    const beforeCleanup = await getTestMembershipGrant(grant.grantId)

    await softDeleteUserAt(member.id, window.firstEligibleDate)
    await cleanupSoftDeletedUsers(window)

    expect(await getTestUserRaw(member.id)).toBeNull()
    await expect(getTestMembershipGrant(grant.grantId)).resolves.toMatchObject({
      revoked_by_id: administrator.id,
      revocation_reason: 'eligibility corrected',
      revoked_at: beforeCleanup!.revoked_at,
      source_cancelled_at: beforeCleanup!.source_cancelled_at,
      activation_ended_at: beforeCleanup!.activation_ended_at,
    })
  }, 60_000)

  it('preserves an expired source while recording final grant revocation', async () => {
    const window = createTestRetentionWindow()
    const [administrator, member] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    if (!administrator || !member) throw new Error('Failed to create test users')
    const sku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(administrator.id, member.id, 'plus', sku.id, 1)
    await using expiryQuery = await beginTransaction()
    await expireElapsedMemberships(member.id, expiryQuery, {
      activateQueuedGrants: false,
      expiresThrough: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    })
    await expiryQuery.commit()
    const beforeCleanup = await getTestMembershipGrant(grant.grantId)
    expect(beforeCleanup?.source_expired_at).toBeInstanceOf(Date)

    await softDeleteUserAt(member.id, window.firstEligibleDate)
    await cleanupSoftDeletedUsers(window)

    await expect(getTestMembershipGrant(grant.grantId)).resolves.toMatchObject({
      revoked_by_id: DELETED_USER_ID,
      revocation_reason: 'account_hard_deleted',
      revoked_at: expect.any(Date),
      source_cancelled_at: null,
      source_expired_at: beforeCleanup!.source_expired_at,
      activation_ended_at: beforeCleanup!.activation_ended_at,
    })
  }, 60_000)

  it('retains a lineage through soft deletion and releases it once for concurrent rebind', async () => {
    const window = createTestRetentionWindow()
    const [originalUser, firstClaimant, secondClaimant] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    if (!originalUser || !firstClaimant || !secondClaimant) {
      throw new Error('Failed to create test users')
    }
    const sku = await createTestSku({ plan: 'plus' })
    const lineageId = `sub_retention_rebind_${v7()}`
    await createMembership({
      userId: originalUser.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: lineageId,
    })

    await softDeleteUserAt(originalUser.id, window.afterUpperBoundDate)
    await cleanupSoftDeletedUsers(window)
    await expect(
      createMembership({
        userId: firstClaimant.id,
        plan: 'plus',
        skuId: sku.id,
        stripeSubscriptionId: lineageId,
      }),
    ).rejects.toThrow('Provider lineage is bound to another account')

    await softDeleteUserAt(originalUser.id, window.firstEligibleDate)
    await cleanupSoftDeletedUsers(window)
    expect(await getTestUserRaw(originalUser.id)).toBeNull()

    const claims = await Promise.allSettled(
      [firstClaimant.id, secondClaimant.id].map(userId =>
        createMembership({
          userId,
          plan: 'plus',
          skuId: sku.id,
          stripeSubscriptionId: lineageId,
        }),
      ),
    )
    expect(claims.filter(claim => claim.status === 'fulfilled')).toHaveLength(1)
    expect(claims.filter(claim => claim.status === 'rejected')).toHaveLength(1)
  }, 60_000)
})
