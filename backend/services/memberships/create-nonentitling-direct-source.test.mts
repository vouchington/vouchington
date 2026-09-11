import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { getMembershipByUserId } from './get.mts'

describe('non-entitling direct sources', () => {
  it.each([
    ['cancelled', 'cancelled_at'],
    ['expired', 'expired_at'],
    ['paused', 'paused_at'],
  ] as const)(
    'retains family access and source state for an initial %s direct source',
    async (status, stateField) => {
      const user = await createTestUser()
      const familySku = await createTestSku({
        plan: 'plus',
        provider_application_id: `family-direct-state-${randomUUID()}`,
      })
      const family = await createTestFamilyMembership({
        applicationId: familySku.provider_application_id,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        membershipProductId: familySku.id,
        membershipProviderProductId: familySku.membership_provider_product_id,
        userId: user.id,
      })
      const directSku = await createTestSku({ plan: 'pro' })

      const direct = await createMembership({
        userId: user.id,
        plan: 'pro',
        skuId: directSku.id,
        stripeSubscriptionId: `sub_initial_${status}_${randomUUID()}`,
        status,
        terminalEffectiveAt: status === 'paused' ? undefined : new Date('2020-01-01T00:00:00.000Z'),
      })

      expect(direct.projected).toBe(false)
      await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ id: family.id })
      await expect(getTestMembershipRaw(family.id)).resolves.toMatchObject({
        projection_ended_at: null,
      })
      await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
        projection_ended_at: expect.any(Date),
      })
      await expect(getTestMembershipSourceState(direct.id)).resolves.toMatchObject({
        [stateField]: expect.any(Date),
      })
    },
  )

  it('retains an initial terminal source without making it effective', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'pro' })

    const direct = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: `sub_terminal_without_prior_${randomUUID()}`,
      status: 'cancelled',
      terminalEffectiveAt: new Date('2020-01-01T00:00:00.000Z'),
    })

    expect(direct.projected).toBe(false)
    await expect(getMembershipByUserId(user.id)).resolves.toBeNull()
    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      projection_ended_at: expect.any(Date),
    })
    await expect(getTestMembershipSourceState(direct.id)).resolves.toMatchObject({
      cancelled_at: new Date('2020-01-01T00:00:00.000Z'),
    })
  })

  it('records concurrent paused sources without displacing current family access', async () => {
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-concurrent-paused-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    const directSku = await createTestSku({ plan: 'pro' })

    const sources = await Promise.all(
      ['first', 'second'].map(source =>
        createMembership({
          userId: user.id,
          plan: 'pro',
          skuId: directSku.id,
          stripeSubscriptionId: `sub_concurrent_paused_${source}_${randomUUID()}`,
          status: 'paused',
        }),
      ),
    )

    expect(sources).toHaveLength(2)
    expect(sources.every(source => !source.projected)).toBe(true)
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ id: family.id })
    await expect(getTestMembershipRaw(family.id)).resolves.toMatchObject({
      projection_ended_at: null,
    })
    await Promise.all(
      sources.map(source =>
        expect(getTestMembershipSourceState(source.id)).resolves.toMatchObject({
          paused_at: expect.any(Date),
        }),
      ),
    )
  })
})
