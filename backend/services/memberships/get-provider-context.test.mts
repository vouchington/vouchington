import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createRetiredTestSku,
  createTestMembership,
  createTestSku,
  createTestUser,
  observeTestPostgresQueryPools,
} from '@voucha/test-helpers'
import {
  getActivePlans,
  getMembershipByUserId,
  getMembershipByStripeSubscriptionId,
  getRetainedDirectMembershipSourceByStripeIdentity,
  getSkuByStripePriceId,
  getSkuByStripePriceIdForLifecycle,
} from './get.mts'

describe('membership provider context lookups', () => {
  it('uses one test-mode context for active catalog and lifecycle lookup', async () => {
    const applicationId = `test-provider-context-catalog-${randomUUID()}`
    const sku = await createTestSku({
      provider_environment: 'test',
      provider_application_id: applicationId,
    })
    const context = { environment: 'test' as const, applicationId }
    const sourceIdentity = stripeSourceIdentity(
      `sub_test_catalog_${randomUUID()}`,
      context.environment,
      context.applicationId,
    )

    await expect(getSkuByStripePriceId(sku.stripe_price_id, context)).resolves.toMatchObject({
      id: sku.id,
    })
    expect((await getActivePlans(context)).get(sku.plan)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: sku.id })]),
    )
    await expect(
      getSkuByStripePriceIdForLifecycle(sku.stripe_price_id, sourceIdentity),
    ).resolves.toMatchObject({ id: sku.id })
  })

  it('hydrates a test-mode Stripe membership with its source-context mapping', async () => {
    const user = await createTestUser()
    const applicationId = `membership-hydration-${randomUUID()}`
    const sku = await createTestSku({
      price_minor_units: 725,
      provider_environment: 'test',
      provider_application_id: applicationId,
      stripe_price_id: `price_test_membership_${randomUUID()}`,
    })
    await createTestMembership({
      user_id: user.id,
      sku_id: sku.id,
      stripe_subscription_id: `sub_test_membership_${randomUUID()}`,
      provider_environment: 'test',
      provider_application_id: applicationId,
    })

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      sku: {
        id: sku.id,
        price: { amount: 725, currency: 'usd' },
        stripe_price_id: sku.stripe_price_id,
      },
    })
  })

  it('does not hydrate an admin grant with deployment Stripe pricing', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      price_minor_units: 825,
      provider_environment: 'test',
      // Any application id works here: view_memberships excludes admin_grant sources from the
      // stripe_mapping LATERAL entirely (source.source_kind <> 'admin_grant'), so this test is not
      // actually contending the shared voucha-web mapping.
      provider_application_id: `test-provider-context-admin-grant-${randomUUID()}`,
      stripe_price_id: `price_test_admin_grant_${randomUUID()}`,
    })
    await createTestMembership({
      user_id: user.id,
      sku_id: sku.id,
      stripe_subscription_id: null,
    })

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      sku: {
        id: sku.id,
        price: null,
        stripe_price_id: null,
      },
    })
  })

  it('scopes an identical Stripe subscription ID to its provider context', async () => {
    const subscriptionId = `sub_context_${randomUUID()}`
    const applicationId = `membership-context-${randomUUID()}`
    const [testUser, productionUser, otherApplicationUser] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const testIdentity = stripeSourceIdentity(subscriptionId, 'test', applicationId)
    const productionIdentity = stripeSourceIdentity(subscriptionId, 'production', applicationId)
    const otherApplicationIdentity = stripeSourceIdentity(
      subscriptionId,
      'production',
      `${applicationId}-other`,
    )

    await Promise.all([
      createTestMembership({
        user_id: testUser!.id,
        stripe_subscription_id: subscriptionId,
        provider_environment: testIdentity.environment,
        provider_application_id: testIdentity.applicationId,
      }),
      createTestMembership({
        user_id: productionUser!.id,
        stripe_subscription_id: subscriptionId,
        provider_environment: productionIdentity.environment,
        provider_application_id: productionIdentity.applicationId,
      }),
      createTestMembership({
        user_id: otherApplicationUser!.id,
        stripe_subscription_id: subscriptionId,
        provider_environment: otherApplicationIdentity.environment,
        provider_application_id: otherApplicationIdentity.applicationId,
      }),
    ])

    await expect(getMembershipByStripeSubscriptionId(testIdentity)).resolves.toMatchObject({
      user_id: testUser!.id,
      stripe_subscription_id: subscriptionId,
    })
    await expect(getMembershipByStripeSubscriptionId(productionIdentity)).resolves.toMatchObject({
      user_id: productionUser!.id,
      stripe_subscription_id: subscriptionId,
    })
    await expect(
      getMembershipByStripeSubscriptionId(otherApplicationIdentity),
    ).resolves.toMatchObject({
      user_id: otherApplicationUser!.id,
      stripe_subscription_id: subscriptionId,
    })
  })

  it('finds a retained direct source only in its provider context', async () => {
    const subscriptionId = `sub_retained_context_${randomUUID()}`
    const applicationId = `membership-retained-context-${randomUUID()}`
    const [testUser, productionUser] = await Promise.all([createTestUser(), createTestUser()])
    const testIdentity = stripeSourceIdentity(subscriptionId, 'test', applicationId)
    const productionIdentity = stripeSourceIdentity(subscriptionId, 'production', applicationId)

    await Promise.all([
      createRetainedPausedDirectSource(testUser!.id, testIdentity),
      createRetainedPausedDirectSource(productionUser!.id, productionIdentity),
    ])

    await expect(
      getRetainedDirectMembershipSourceByStripeIdentity(testIdentity),
    ).resolves.toMatchObject({
      userId: testUser!.id,
      status: 'paused',
    })
    await expect(
      getRetainedDirectMembershipSourceByStripeIdentity(productionIdentity),
    ).resolves.toMatchObject({
      userId: productionUser!.id,
      status: 'paused',
    })
  })

  it('routes Stripe source discovery through the write pool', async () => {
    const applicationId = `test-provider-context-write-pool-${randomUUID()}`
    const activeUser = await createTestUser()
    const retainedUser = await createTestUser()
    const activeIdentity = stripeSourceIdentity(
      `sub_primary_active_${randomUUID()}`,
      'production',
      applicationId,
    )
    const retainedIdentity = stripeSourceIdentity(
      `sub_primary_retained_${randomUUID()}`,
      'production',
      applicationId,
    )
    await createTestMembership({
      user_id: activeUser.id,
      stripe_subscription_id: activeIdentity.providerLineageId,
      provider_environment: activeIdentity.environment,
      provider_application_id: activeIdentity.applicationId,
    })
    await createRetainedPausedDirectSource(retainedUser.id, retainedIdentity)

    const active = await observeTestPostgresQueryPools(
      '/* getMembershipByStripeSubscriptionId */',
      () => getMembershipByStripeSubscriptionId(activeIdentity),
    )
    expect(active.pools).toEqual(['write'])
    expect(active.result).toMatchObject({ user_id: activeUser.id })

    const retained = await observeTestPostgresQueryPools(
      '/* getRetainedDirectMembershipSourceByStripeIdentity */',
      () => getRetainedDirectMembershipSourceByStripeIdentity(retainedIdentity),
    )
    expect(retained.pools).toEqual(['write'])
    expect(retained.result).toMatchObject({ userId: retainedUser.id, status: 'paused' })
  })

  it('resolves a lifecycle Stripe SKU after its mapping and canonical product retire', async () => {
    const sku = await createRetiredTestSku({
      provider_application_id: `test-provider-context-lifecycle-${randomUUID()}`,
      provider_environment: 'production',
    })
    const sourceIdentity = stripeSourceIdentity(
      `sub_lifecycle_sku_${randomUUID()}`,
      sku.provider_environment,
      sku.provider_application_id,
    )
    const sourceUser = await createTestUser()
    await createTestMembership({
      user_id: sourceUser.id,
      plan: sku.plan,
      sku_id: sku.id,
      status: 'paused',
      stripe_subscription_id: sourceIdentity.providerLineageId,
      provider_environment: sourceIdentity.environment,
      provider_application_id: sourceIdentity.applicationId,
    })

    await expect(getSkuByStripePriceId(sku.stripe_price_id)).resolves.toBeNull()
    await expect(
      getSkuByStripePriceIdForLifecycle(sku.stripe_price_id, sourceIdentity),
    ).resolves.toMatchObject({
      id: sku.id,
      plan: sku.plan,
      stripe_price_id: sku.stripe_price_id,
      retired_at: expect.any(Date),
    })
    await expect(
      getSkuByStripePriceIdForLifecycle(sku.stripe_price_id, {
        ...sourceIdentity,
        providerLineageId: `sub_unbound_${randomUUID()}`,
      }),
    ).resolves.toBeNull()

    const transitionedSku = await createRetiredTestSku({
      provider_application_id: sourceIdentity.applicationId,
      provider_environment: sourceIdentity.environment,
    })
    await expect(
      getSkuByStripePriceIdForLifecycle(transitionedSku.stripe_price_id, sourceIdentity),
    ).resolves.toMatchObject({
      id: transitionedSku.id,
      stripe_price_id: transitionedSku.stripe_price_id,
    })
  })
})

function stripeSourceIdentity(
  providerLineageId: string,
  environment: 'test' | 'production',
  applicationId: string,
) {
  return {
    provider: 'stripe' as const,
    environment,
    applicationId,
    providerLineageId,
  }
}

async function createRetainedPausedDirectSource(
  userId: string,
  sourceIdentity: ReturnType<typeof stripeSourceIdentity>,
): Promise<void> {
  await createTestMembership({
    user_id: userId,
    status: 'paused',
    stripe_subscription_id: sourceIdentity.providerLineageId,
    provider_environment: sourceIdentity.environment,
    provider_application_id: sourceIdentity.applicationId,
  })
  await createTestMembership({ user_id: userId, stripe_subscription_id: null })
}
