import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
} from '@voucha/test-helpers'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'
import {
  createElapsedAdminGrantForCurrentPaidMembershipView,
  createStaleProviderMembershipSource,
  getCurrentPaidMemberships,
  readTestCurrentPaidMembershipsAtExpiryOffsets,
  getCurrentPaidMembershipTestProducts,
  getMembershipBillingIdentities,
  getMembershipStatuses,
  getPrivateUserMemberships,
} from '../../../test-helpers/data-stores/psql/current-paid-memberships.mts'

describe('current paid membership views', () => {
  it('uses transaction-stable PostgreSQL time at finite source expiry boundaries', async () => {
    const grantFixtures = await Promise.all(
      [-1, 0, 1].map(async offset => {
        const user = await createLocalTestUser()
        const membership = await createTestMembership({
          effective_at: new Date('2020-01-01T00:00:00.000Z'),
          user_id: user.id,
          plan: 'plus',
        })
        return { membershipId: membership.id, offset, userId: user.id }
      }),
    )
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `current-paid-expiry-${randomUUID()}`,
    })
    const familyFixtures = await Promise.all(
      [-1, 0, 1].map(async offset => {
        const user = await createLocalTestUser()
        const membership = await createTestFamilyMembership({
          applicationId: familySku.provider_application_id,
          effectiveAt: new Date('2020-01-01T00:00:00.000Z'),
          expiresAt: new Date('2031-01-01T00:00:00.000Z'),
          membershipProductId: familySku.id,
          membershipProviderProductId: familySku.membership_provider_product_id,
          sourceEffectiveAt: new Date('2020-01-01T00:00:00.000Z'),
          userId: user.id,
        })
        return { membershipId: membership.id, offset, userId: user.id }
      }),
    )
    const fixtures = [...grantFixtures, ...familyFixtures]
    const currentPaid = await readTestCurrentPaidMembershipsAtExpiryOffsets(fixtures)
    expect(currentPaid).toEqual(
      expect.arrayContaining([
        { user_id: grantFixtures[2]!.userId, plan: 'plus' },
        { user_id: familyFixtures[2]!.userId, plan: 'plus' },
      ]),
    )
    expect(currentPaid).toHaveLength(2)
  })

  it('derives elapsed family and administrator-grant sources as expired', async () => {
    const [directUser, familyUser, grantUser] = await Promise.all([
      createLocalTestUser(),
      createLocalTestUser(),
      createLocalTestUser(),
    ])
    const products = await getCurrentPaidMembershipTestProducts()
    expect(products).toHaveLength(2)
    const [plusProduct, proProduct] = products
    const stalePeriodEnd = new Date(Date.now() - 60_000)
    await Promise.all([
      createStaleProviderMembershipSource(
        directUser.id,
        plusProduct.id,
        stalePeriodEnd,
        'direct',
        true,
      ),
      createStaleProviderMembershipSource(
        familyUser.id,
        proProduct.id,
        stalePeriodEnd,
        'family',
        true,
      ),
      createElapsedAdminGrantForCurrentPaidMembershipView(
        grantUser.id,
        proProduct.id,
        stalePeriodEnd,
        true,
      ),
    ])

    const statuses = await getMembershipStatuses([directUser.id, familyUser.id, grantUser.id])
    expect(Object.fromEntries(statuses.map(({ user_id, status }) => [user_id, status]))).toEqual({
      [directUser.id]: 'past_due',
      [familyUser.id]: 'expired',
      [grantUser.id]: 'expired',
    })
    const billingIdentities = await getMembershipBillingIdentities([directUser.id, familyUser.id])
    expect(billingIdentities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: directUser.id,
          stripe_customer_id: expect.any(String),
          stripe_subscription_id: expect.any(String),
        }),
        {
          user_id: familyUser.id,
          expires_at: stalePeriodEnd,
          stripe_customer_id: null,
          stripe_subscription_id: null,
        },
      ]),
    )
  })

  it('retains a stale direct source but excludes elapsed finite sources', async () => {
    const [directUser, familyUser, grantUser] = await Promise.all([
      createLocalTestUser(),
      createLocalTestUser(),
      createLocalTestUser(),
    ])
    const products = await getCurrentPaidMembershipTestProducts()
    expect(products).toHaveLength(2)
    const [plusProduct, proProduct] = products
    const stalePeriodEnd = new Date(Date.now() - 60_000)
    await Promise.all([
      createStaleProviderMembershipSource(
        directUser.id,
        plusProduct.id,
        stalePeriodEnd,
        'direct',
        true,
      ),
      createStaleProviderMembershipSource(
        familyUser.id,
        proProduct.id,
        stalePeriodEnd,
        'family',
        true,
      ),
      createElapsedAdminGrantForCurrentPaidMembershipView(
        grantUser.id,
        proProduct.id,
        stalePeriodEnd,
        true,
      ),
    ])

    const currentPaid = await getCurrentPaidMemberships([
      directUser.id,
      familyUser.id,
      grantUser.id,
    ])
    expect(currentPaid).toEqual([{ user_id: directUser.id, plan: 'plus' }])

    const privateUsers = await getPrivateUserMemberships([
      directUser.id,
      familyUser.id,
      grantUser.id,
    ])
    expect(privateUsers).toHaveLength(3)
    expect(
      Object.fromEntries(privateUsers.map(({ id, membership_plan }) => [id, membership_plan])),
    ).toEqual({
      [directUser.id]: 'plus',
      [familyUser.id]: null,
      [grantUser.id]: null,
    })
  })
})
