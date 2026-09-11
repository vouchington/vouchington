import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  getTestGrantQueue,
  getTestMembershipEntitlementEffects,
  setTestMembershipGrantRemainingMilliseconds,
  updateTestMembershipExpiresAt,
  withTestMembershipUserLocked,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../create.mts'
import {
  expireElapsedMembershipsBatch,
  expireElapsedMembershipsForUser,
  expireElapsedMembershipsForUsers,
  getElapsedMembershipUserIdsBatch,
} from './expire-elapsed.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'

describe('expireElapsedMembershipsForUser', () => {
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
    const grant = await grantMembership(admin.id, member.id, 'pro', grantSku.id, 30)
    await updateTestMembershipExpiresAt(grant.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(expireElapsedMembershipsForUser(member.id)).resolves.toBe(1)

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
    const first = await grantMembership(admin.id, member.id, 'plus', firstSku.id, 30)
    const secondSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await grantMembership(queuedGrantIssuer.id, member.id, 'pro', secondSku.id, 30)
    await updateTestMembershipExpiresAt(first.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(expireElapsedMembershipsForUsers([member.id])).resolves.toEqual({ expired: 1 })
    const activeMembership = await getMembershipByUserId(member.id)
    expect(activeMembership).toMatchObject({ plan: 'pro' })
    const history = await getMembershipHistory(member.id)
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
    const first = await grantMembership(admin.id, member.id, 'plus', firstSku.id, 30)
    const secondSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await grantMembership(admin.id, member.id, 'pro', secondSku.id, 1)
    const [firstGrantId, secondGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(firstGrantId).toBeDefined()
    expect(secondGrantId).toBeDefined()
    await setTestMembershipGrantRemainingMilliseconds(secondGrantId!, 0.5)
    await updateTestMembershipExpiresAt(first.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(expireElapsedMembershipsForUser(member.id)).resolves.toBe(1)
    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
  })

  it('bounds each candidate scan', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const membership = await grantMembership(admin.id, member.id, 'plus', sku.id, 30)
    await updateTestMembershipExpiresAt(membership.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(getElapsedMembershipUserIdsBatch(1)).resolves.toHaveLength(1)
  })

  it('scans and expires elapsed grants through the scheduled batch entrypoint', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const membership = await grantMembership(admin.id, member.id, 'plus', sku.id, 30)
    await updateTestMembershipExpiresAt(membership.id, new Date('2020-01-01T00:00:00.000Z'))

    const result = await expireElapsedMembershipsBatch(1_000_000)

    expect(result.expired).toBeGreaterThanOrEqual(1)
    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
  })

  it.each([0, -1, 1.5])('rejects invalid candidate batch size %s', async batchSize => {
    await expect(getElapsedMembershipUserIdsBatch(batchSize)).rejects.toThrow(RangeError)
  })

  it('skips locked users and recovers them on the next batch', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const membership = await grantMembership(admin.id, member.id, 'plus', sku.id, 30)
    await updateTestMembershipExpiresAt(membership.id, new Date('2020-01-01T00:00:00.000Z'))

    await withTestMembershipUserLocked(member.id, async () => {
      const candidates = await getElapsedMembershipUserIdsBatch(1_000_000)
      expect(candidates).not.toContain(member.id)
      await expect(expireElapsedMembershipsForUsers([member.id])).resolves.toEqual({ expired: 0 })
    })
    await expect(expireElapsedMembershipsForUsers([member.id])).resolves.toEqual({ expired: 1 })
    await expect(expireElapsedMembershipsForUsers([member.id])).resolves.toEqual({ expired: 0 })
  })
})
