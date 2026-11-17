import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestAdminGrantMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  getTestGrantQueue,
  getTestMembershipEntitlementEffects,
  insertQueuedMembershipGrant,
  setTestMembershipGrantRemainingMilliseconds,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import {
  expireElapsedMembershipsBatch,
  expireElapsedMembershipsForUsers,
  getElapsedMembershipUserIdsBatch,
} from './expire-elapsed-batch.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'
import { membershipWorkConfig } from '../work-limits.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

describe('expireElapsedMembershipsForUsers', () => {
  it('shares one page budget across users and leaves the remainder for the next run', async () => {
    const admin = await createTestUser({ administrator: true })
    const members = await Promise.all([createTestUser(), createTestUser()])
    const sku = await createTestSku({ plan: 'plus' })
    // This tests expiry's shared budget; grant creation is setup, so use committed fixtures.
    const memberships = [
      await createTestAdminGrantMembership({
        grantedById: admin.id,
        productId: sku.id,
        userId: members[0]!.id,
      }),
      await createTestAdminGrantMembership({
        grantedById: admin.id,
        productId: sku.id,
        userId: members[1]!.id,
      }),
    ]
    await Promise.all(
      memberships.map(membership =>
        updateTestMembershipExpiresAt(membership.id, new Date('2020-01-01')),
      ),
    )
    overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
      batch_size: 2,
      max_batches_per_run: 1,
    })
    // A concurrent global sweep may expire either owned member first, so a call's own count is
    // only bounded by the page budget; assert the owned persisted state after both runs.
    const first = await expireElapsedMembershipsForUsers(members.map(member => member.id))
    expect(first.expired).toBeLessThanOrEqual(1)
    // Per-user expiry blocks on the row lock, so it waits for any in-flight competitor.
    await expireElapsedMembershipsForUsers([members[0]!.id])
    await expireElapsedMembershipsForUsers([members[1]!.id])
    for (const [index, member] of members.entries()) {
      await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
      expect(
        (await getMembershipHistory(member.id)).results.filter(
          row => row.membership_id === memberships[index]!.id && row.change_type === 'expiration',
        ),
      ).toHaveLength(1)
    }
  })
  it('restores a retained verified direct Stripe source after the covering grant expires', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const directSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `expired-grant-direct-fallback-${randomUUID()}`,
    })
    const stripeSubscriptionId = `sub_expired_grant_direct_fallback_${randomUUID()}`
    const direct = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: directSku.id,
      stripeSubscriptionId,
      providerApplicationId: directSku.provider_application_id,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })
    await endTestMembershipProjection(direct.id)
    const grantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const grant = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: member.id,
    })
    await updateTestMembershipExpiresAt(grant.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(expireElapsedMembershipsForUsers([member.id])).resolves.toEqual({
      expired: 1,
      hasMore: false,
    })

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
      stripe_subscription_id: stripeSubscriptionId,
    })
  })

  it('uses a fixed point to expire and promote queued grants in FIFO order', async () => {
    const admin = await createTestUser({ administrator: true })
    const queuedGrantIssuer = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const firstSku = await createTestSku({ plan: 'plus' })
    const first = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: firstSku.id,
      userId: member.id,
    })
    const secondSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await insertQueuedMembershipGrant({
      grantedById: queuedGrantIssuer.id,
      productId: secondSku.id,
      userId: member.id,
      durationDays: 30,
    })
    await updateTestMembershipExpiresAt(first.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(expireElapsedMembershipsForUsers([member.id])).resolves.toEqual({
      expired: 1,
      hasMore: false,
    })
    const activeMembership = await getMembershipByUserId(member.id)
    expect(activeMembership).toMatchObject({ plan: 'pro' })
    const history = (await getMembershipHistory(member.id)).results
    const expirationChange = history.find(
      change => change.membership_id === first.id && change.change_type === 'expiration',
    )
    const activationChange = history.find(
      change =>
        change.membership_id === activeMembership?.id && change.change_type === 'admin_grant',
    )
    expect(expirationChange).toBeDefined()
    expect(activationChange).toBeDefined()
    expect(activationChange).toMatchObject({ changed_by_id: queuedGrantIssuer.id })
    await expect(
      Promise.all([
        getTestMembershipEntitlementEffects(expirationChange!.id),
        getTestMembershipEntitlementEffects(activationChange!.id),
      ]),
    ).resolves.toEqual([
      [expect.objectContaining({ user_id: member.id })],
      [expect.objectContaining({ user_id: member.id })],
    ])
  })

  it('does not activate a queued grant with less than one millisecond remaining', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const firstSku = await createTestSku({ plan: 'plus' })
    const first = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: firstSku.id,
      userId: member.id,
    })
    const secondSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: secondSku.id,
      userId: member.id,
      durationDays: 1,
    })
    const [firstGrantId, secondGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(firstGrantId).toBeDefined()
    expect(secondGrantId).toBeDefined()
    await setTestMembershipGrantRemainingMilliseconds(secondGrantId!, 0.5)
    await updateTestMembershipExpiresAt(first.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(expireElapsedMembershipsForUsers([member.id])).resolves.toEqual({
      expired: 1,
      hasMore: false,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
  })

  it('bounds each candidate scan', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const membership = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: sku.id,
      userId: member.id,
    })
    await updateTestMembershipExpiresAt(membership.id, new Date('2020-01-01T00:00:00.000Z'))

    expect((await getElapsedMembershipUserIdsBatch(1)).length).toBeLessThanOrEqual(1)
  })

  it('scans and expires elapsed grants through the scheduled batch entrypoint', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const membership = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: sku.id,
      userId: member.id,
    })
    await updateTestMembershipExpiresAt(membership.id, new Date('2020-01-01T00:00:00.000Z'))

    // The scan is global: a concurrent sweep may expire the owned member first, so assert the
    // owned persisted state rather than this invocation's count.
    // Start the orphan repair past every grant so this global sweep cannot repair another test's rows.
    await expireElapsedMembershipsBatch(1_000_000, {
      userId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      grantId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    })

    // The blocking per-user expiry waits for any in-flight competitor, then rechecks.
    await expireElapsedMembershipsForUsers([member.id])

    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
    expect(
      (await getMembershipHistory(member.id)).results.filter(
        row => row.membership_id === membership.id && row.change_type === 'expiration',
      ),
    ).toHaveLength(1)
  })

  it.each([0, -1, 1.5])('rejects invalid candidate batch size %s', async batchSize => {
    await expect(getElapsedMembershipUserIdsBatch(batchSize)).rejects.toThrow(RangeError)
  })

  it('expires an owned projection once across concurrent sweepers', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const membership = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: sku.id,
      userId: member.id,
    })
    await updateTestMembershipExpiresAt(membership.id, new Date('2020-01-01'))
    const results = await Promise.all([
      expireElapsedMembershipsForUsers([member.id]),
      expireElapsedMembershipsForUsers([member.id]),
    ])
    expect(results.map(result => result.expired).toSorted((a, b) => a - b)).toEqual([0, 1])
    expect(results.every(result => !result.hasMore)).toBe(true)
    expect(
      (await getMembershipHistory(member.id)).results.filter(
        row => row.membership_id === membership.id && row.change_type === 'expiration',
      ),
    ).toHaveLength(1)
    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
  })
})
