import { describe, expect, it } from 'vitest'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'
import {
  createElapsedAdminGrantForCurrentPaidMembershipView,
  createStaleProviderMembershipSource,
  getCurrentPaidMemberships,
  getCurrentPaidMembershipTestProducts,
  getMembershipBillingIdentities,
  getMembershipStatuses,
  getPrivateUserMemberships,
} from '../../../test-helpers/data-stores/psql/current-paid-memberships.mts'

describe('current paid membership views', () => {
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
