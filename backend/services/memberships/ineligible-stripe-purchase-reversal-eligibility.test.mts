import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  createTestUser,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import {
  getPurchaseDisposition,
  isIneligiblePurchase,
  type CurrentMembershipForIneligiblePurchase,
} from './ineligible-stripe-purchase-reversal-eligibility.mts'
import { prepareIneligiblePurchaseReversal } from './ineligible-stripe-purchase-reversal/prepare.mts'

describe('isIneligiblePurchase', () => {
  it('has no disposition without a current membership', () => {
    expect(
      getPurchaseDisposition(null, {
        incomingPlan: 'pro',
        incomingStatus: 'active',
        providerEnvironment: 'production',
        subscriptionId: 'sub_no_current_membership',
      }),
    ).toBe('none')
  })

  it('converges the same Stripe subscription in the default web application', () => {
    expect(
      getPurchaseDisposition(
        {
          ...makeMembership('direct'),
          provider: 'stripe',
          providerApplicationId: 'voucha-web',
          providerEnvironment: 'production',
          providerLineageId: 'sub_converged_default_application',
        },
        {
          incomingPlan: 'pro',
          incomingStatus: 'active',
          providerEnvironment: 'production',
          subscriptionId: 'sub_converged_default_application',
        },
      ),
    ).toBe('converged')
  })

  it('does not converge a Stripe subscription against a colliding non-Stripe lineage', () => {
    expect(
      getPurchaseDisposition(
        {
          ...makeMembership('direct'),
          providerApplicationId: 'voucha-web',
          providerEnvironment: 'production',
          providerLineageId: 'sub_cross_provider_collision',
        },
        {
          incomingPlan: 'pro',
          incomingStatus: 'active',
          providerEnvironment: 'production',
          subscriptionId: 'sub_cross_provider_collision',
        },
      ),
    ).toBe('ineligible')
  })

  it('keeps an elapsed direct term blocking until Stripe confirms its lifecycle transition', () => {
    expect(isIneligiblePurchase(makeMembership('direct'), 'pro', 'active')).toBe(true)
  })

  it('treats an elapsed finite administrator grant as no longer blocking', () => {
    expect(isIneligiblePurchase(makeMembership('admin_grant'), 'pro', 'active')).toBe(false)
  })

  it('does not replace an active grant with a non-active higher-tier purchase', () => {
    const activeGrant = { ...makeMembership('admin_grant'), expiresAt: null }

    expect(isIneligiblePurchase(activeGrant, 'pro', 'paused')).toBe(true)
    expect(isIneligiblePurchase(activeGrant, 'pro', 'past_due')).toBe(true)
  })

  it('allows an active higher-tier purchase to replace an active grant', () => {
    const activeGrant = { ...makeMembership('admin_grant'), expiresAt: null }

    expect(isIneligiblePurchase(activeGrant, 'pro', 'active')).toBe(false)
  })

  it('rejects an equal-tier direct purchase that collides with family access', () => {
    expect(isIneligiblePurchase(makeMembership('family'), 'plus', 'active')).toBe(true)
  })

  it('rejects a plan outside the closed membership-plan vocabulary', () => {
    expect(() =>
      isIneligiblePurchase(makeMembership('family'), 'enterprise' as never, 'active'),
    ).toThrow('Unhandled membership plan: enterprise')
  })

  it('does not block a non-active Stripe purchase on an elapsed family projection', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-reversal-elapsed-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      userId: user.id,
    })
    await updateTestMembershipExpiresAt(family.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(
      prepareIneligiblePurchaseReversal({
        customerId: `cus_family_reversal_elapsed_${randomUUID()}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'plus',
        incomingStatus: 'paused',
        originatingInvoiceId: `in_family_reversal_elapsed_${randomUUID()}`,
        providerEnvironment: 'production',
        sku,
        stripePriceId: sku.stripe_price_id,
        subscriptionId: `sub_family_reversal_elapsed_${randomUUID()}`,
        userId: user.id,
      }),
    ).resolves.toMatchObject({ disposition: 'none' })
  })

  it('does not reverse against a family projection whose provider state is no longer valid', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-reversal-paused-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceStatus: 'paused',
      userId: user.id,
    })

    await expect(
      prepareIneligiblePurchaseReversal({
        customerId: `cus_family_reversal_paused_${randomUUID()}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'plus',
        incomingStatus: 'active',
        originatingInvoiceId: `in_family_reversal_paused_${randomUUID()}`,
        providerEnvironment: 'production',
        sku,
        stripePriceId: sku.stripe_price_id,
        subscriptionId: `sub_family_reversal_paused_${randomUUID()}`,
        userId: user.id,
      }),
    ).resolves.toMatchObject({ disposition: 'none' })
  })

  it('does not block a non-active Stripe purchase on a paused direct projection', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    await createTestMembership({
      sku_id: sku.id,
      status: 'paused',
      stripe_subscription_id: `sub_reversal_elapsed_paused_${randomUUID()}`,
      user_id: user.id,
    })
    await expect(
      prepareIneligiblePurchaseReversal({
        customerId: `cus_reversal_elapsed_paused_${randomUUID()}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'plus',
        incomingStatus: 'paused',
        originatingInvoiceId: `in_reversal_elapsed_paused_${randomUUID()}`,
        providerEnvironment: 'production',
        sku,
        stripePriceId: sku.stripe_price_id,
        subscriptionId: `sub_reversal_elapsed_paused_incoming_${randomUUID()}`,
        userId: user.id,
      }),
    ).resolves.toMatchObject({ disposition: 'none' })
  })
})

function makeMembership(
  sourceKind: CurrentMembershipForIneligiblePurchase['sourceKind'],
): CurrentMembershipForIneligiblePurchase {
  return {
    effectiveAt: new Date('2019-01-01T00:00:00.000Z'),
    expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    plan: 'plus',
    provider: null,
    providerApplicationId: null,
    providerEnvironment: null,
    providerLineageId: null,
    sourceKind,
  }
}
