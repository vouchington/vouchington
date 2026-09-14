import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'
import {
  getCurrentPaidMembershipForUser,
  getPrivateUserMembershipForUser,
} from '../../../test-helpers/data-stores/psql/current-paid-memberships-family-source-authority.mts'
import { createTestFamilyMembership } from '../../../test-helpers/entities/memberships/family.mts'
import { createTestSku } from '../../../test-helpers/entities/memberships.mts'
import { rejectTestMembershipProviderEvidence } from '../../../test-helpers/entities/memberships/updates.mts'

describe('current paid membership view family-source authority', () => {
  it.each(['cancelled', 'expired', 'past_due', 'paused'] as const)(
    'excludes a live family projection with a %s source state',
    async sourceStatus => {
      const user = await createLocalTestUser()
      const sku = await createTestSku({
        plan: 'plus',
        provider_application_id: `current-paid-family-${sourceStatus}-${randomUUID()}`,
      })
      await createTestFamilyMembership({
        applicationId: sku.provider_application_id,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        membershipProductId: sku.id,
        membershipProviderProductId: sku.membership_provider_product_id,
        sourceStatus,
        userId: user.id,
      })

      await expect(getCurrentPaidMembershipForUser(user.id)).resolves.toEqual([])
    },
  )

  it('excludes future, elapsed, and rejected family sources while retaining a valid source', async () => {
    const validUser = await createLocalTestUser()
    const validSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `current-paid-family-valid-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: validSku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: validSku.id,
      membershipProviderProductId: validSku.membership_provider_product_id,
      userId: validUser.id,
    })

    const futureUser = await createLocalTestUser()
    const futureSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `current-paid-family-future-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: futureSku.provider_application_id,
      effectiveAt: new Date(),
      expiresAt: new Date('2031-01-01T00:00:00.000Z'),
      membershipProductId: futureSku.id,
      membershipProviderProductId: futureSku.membership_provider_product_id,
      sourceEffectiveAt: new Date('2030-01-01T00:00:00.000Z'),
      userId: futureUser.id,
    })

    const elapsedUser = await createLocalTestUser()
    const elapsedSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `current-paid-family-elapsed-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: elapsedSku.provider_application_id,
      expiresAt: new Date('2031-01-01T00:00:00.000Z'),
      membershipProductId: elapsedSku.id,
      membershipProviderProductId: elapsedSku.membership_provider_product_id,
      sourceEffectiveAt: new Date('2019-01-01T00:00:00.000Z'),
      sourceExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
      userId: elapsedUser.id,
    })

    const rejectedUser = await createLocalTestUser()
    const rejectedSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `current-paid-family-rejected-${randomUUID()}`,
    })
    const rejectedFamily = await createTestFamilyMembership({
      applicationId: rejectedSku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: rejectedSku.id,
      membershipProviderProductId: rejectedSku.membership_provider_product_id,
      userId: rejectedUser.id,
    })
    await rejectTestMembershipProviderEvidence(rejectedFamily.id)

    await expect(getCurrentPaidMembershipForUser(validUser.id)).resolves.toEqual([
      { user_id: validUser.id, plan: 'plus' },
    ])
    await expect(getCurrentPaidMembershipForUser(futureUser.id)).resolves.toEqual([])
    await expect(getCurrentPaidMembershipForUser(elapsedUser.id)).resolves.toEqual([])
    await expect(getCurrentPaidMembershipForUser(rejectedUser.id)).resolves.toEqual([])
    await expect(getPrivateUserMembershipForUser(validUser.id)).resolves.toEqual({
      id: validUser.id,
      membership_plan: 'plus',
    })
    await expect(getPrivateUserMembershipForUser(futureUser.id)).resolves.toEqual({
      id: futureUser.id,
      membership_plan: null,
    })
    await expect(getPrivateUserMembershipForUser(elapsedUser.id)).resolves.toEqual({
      id: elapsedUser.id,
      membership_plan: null,
    })
    await expect(getPrivateUserMembershipForUser(rejectedUser.id)).resolves.toEqual({
      id: rejectedUser.id,
      membership_plan: null,
    })
  })
})
