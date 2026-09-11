import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  updateTestMembershipCancelAtPeriodEnd,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import {
  claimRenewalPriceIncreaseNotification,
  getUsersApproachingRenewalWithPriceIncrease,
} from '../renewal-check.mts'

function createPlusSku(priceMinorUnits: number, providerApplicationId: string) {
  return createTestSku({
    plan: 'plus',
    price_minor_units: priceMinorUnits,
    interval: 'monthly',
    provider_application_id: providerApplicationId,
  })
}

async function createObservedRenewingMembership(
  userId: string,
  currentSku: { id: string; membership_provider_product_id: string },
  renewalSku: { membership_provider_product_id: string },
  providerApplicationId: string,
  renewalEffectiveAt: Date,
) {
  const membership = await createMembership({
    userId,
    plan: 'plus',
    skuId: currentSku.id,
    expiresAt: renewalEffectiveAt,
    stripeSubscriptionId: `sub_renewal_${randomUUID()}`,
    providerEnvironment: 'production',
    providerApplicationId,
  })
  const observation = await attachTestStripeProductionProviderObservation({
    membership_id: membership.id,
    membership_provider_product_id: currentSku.membership_provider_product_id,
    renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
    renewal_effective_at: renewalEffectiveAt,
  })
  return { membership, ...observation }
}

function renewalEffectiveAt(daysFromNow: number): Date {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
}

describe('renewal-check exclusions', () => {
  it('excludes provider sources without a verified price observation', async () => {
    const applicationId = `renewal-${randomUUID()}`
    const currentSku = await createPlusSku(500, applicationId)
    await createPlusSku(900, applicationId)
    const user = await createTestUser()
    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      expiresAt: renewalEffectiveAt(15),
      stripeSubscriptionId: `sub_renewal_${randomUUID()}`,
      providerEnvironment: 'production',
      providerApplicationId: applicationId,
    })
    const results = await getUsersApproachingRenewalWithPriceIncrease()
    expect(results.some(result => result.user_id === user.id)).toBe(false)
  })

  it('excludes a renewal more than 30 days away', async () => {
    const applicationId = `renewal-${randomUUID()}`
    const currentSku = await createPlusSku(500, applicationId)
    const renewalSku = await createPlusSku(900, applicationId)
    const user = await createTestUser()
    await createObservedRenewingMembership(
      user.id,
      currentSku,
      renewalSku,
      applicationId,
      renewalEffectiveAt(60),
    )

    const results = await getUsersApproachingRenewalWithPriceIncrease()
    expect(results.some(result => result.user_id === user.id)).toBe(false)
  })

  it('does not claim a queued notice after renewal leaves the 30-day window', async () => {
    const applicationId = `renewal-${randomUUID()}`
    const currentSku = await createPlusSku(500, applicationId)
    const renewalSku = await createPlusSku(900, applicationId)
    const user = await createTestUser()
    const renewal = await createObservedRenewingMembership(
      user.id,
      currentSku,
      renewalSku,
      applicationId,
      renewalEffectiveAt(15),
    )
    const queued = (await getUsersApproachingRenewalWithPriceIncrease()).find(
      result => result.user_id === user.id,
    )
    expect(queued).toBeDefined()

    await attachTestStripeProductionProviderObservation({
      membership_id: renewal.membership.id,
      membership_provider_product_id: currentSku.membership_provider_product_id,
      renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
      renewal_effective_at: renewalEffectiveAt(60),
    })
    await expect(
      claimRenewalPriceIncreaseNotification(
        renewal.membership.id,
        user.id,
        queued!.membership_provider_observation_id,
      ),
    ).resolves.toBeNull()
  })

  it('excludes an already expired membership', async () => {
    const applicationId = `renewal-${randomUUID()}`
    const currentSku = await createPlusSku(500, applicationId)
    const renewalSku = await createPlusSku(900, applicationId)
    const user = await createTestUser()
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      expiresAt: renewalEffectiveAt(15),
      stripeSubscriptionId: `sub_renewal_${randomUUID()}`,
      providerEnvironment: 'production',
      providerApplicationId: applicationId,
      status: 'expired',
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: membership.id,
      membership_provider_product_id: currentSku.membership_provider_product_id,
      renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
      renewal_effective_at: renewalEffectiveAt(15),
    })

    const results = await getUsersApproachingRenewalWithPriceIncrease()
    expect(results.some(result => result.user_id === user.id)).toBe(false)
  })

  it('excludes cancellation at period end', async () => {
    const applicationId = `renewal-${randomUUID()}`
    const currentSku = await createPlusSku(500, applicationId)
    const renewalSku = await createPlusSku(900, applicationId)
    const user = await createTestUser()
    const renewal = await createObservedRenewingMembership(
      user.id,
      currentSku,
      renewalSku,
      applicationId,
      renewalEffectiveAt(10),
    )
    await updateTestMembershipCancelAtPeriodEnd(renewal.membership.id, true)

    const results = await getUsersApproachingRenewalWithPriceIncrease()
    expect(results.some(result => result.user_id === user.id)).toBe(false)
  })

  it('excludes a price decrease', async () => {
    const applicationId = `renewal-${randomUUID()}`
    const currentSku = await createPlusSku(800, applicationId)
    const renewalSku = await createPlusSku(400, applicationId)
    const user = await createTestUser()
    await createObservedRenewingMembership(
      user.id,
      currentSku,
      renewalSku,
      applicationId,
      renewalEffectiveAt(10),
    )

    const results = await getUsersApproachingRenewalWithPriceIncrease()
    expect(results.some(result => result.user_id === user.id)).toBe(false)
  })

  it('excludes family access even when its source is marked auto-renewing', async () => {
    const applicationId = `renewal-family-${randomUUID()}`
    const sku = await createPlusSku(500, applicationId)
    const user = await createTestUser()
    await createTestFamilyMembership({
      applicationId,
      expiresAt: renewalEffectiveAt(15),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      userId: user.id,
    })

    const results = await getUsersApproachingRenewalWithPriceIncrease()
    expect(results.some(result => result.user_id === user.id)).toBe(false)
  })
})
