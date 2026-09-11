import { describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipRaw,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'

describe('createMembership with elapsed grants', () => {
  it('does not activate queued grants behind an active Stripe membership', async () => {
    const admin = await createTestUser({ administrator: true })
    const stripeUser = await createTestUser()
    const firstGrantSku = await createTestSku({ plan: 'plus' })
    const firstGrant = await grantMembership(admin.id, stripeUser.id, 'plus', firstGrantSku.id, 30)
    const queuedGrantSku = await createTestSku({ plan: 'plus', interval: 'yearly' })
    const queuedGrant = await grantMembership(
      admin.id,
      stripeUser.id,
      'plus',
      queuedGrantSku.id,
      30,
    )
    await updateTestMembershipExpiresAt(firstGrant.id, new Date('2020-01-01T00:00:00Z'))
    const stripeSku = await createTestSku({ plan: 'pro' })

    const stripeMembership = await createMembership({
      userId: stripeUser.id,
      plan: 'pro',
      skuId: stripeSku.id,
      stripeSubscriptionId: `sub_queued_grant_${stripeUser.id}`,
    })

    await expect(getMembershipByUserId(stripeUser.id)).resolves.toMatchObject({
      id: stripeMembership.id,
      status: 'active',
    })
    await expect(getTestGrantQueue(stripeUser.id)).resolves.toMatchObject({
      grant_ids: expect.arrayContaining([queuedGrant.grantId]),
      open_activation_count: 0,
    })
  })

  it('preserves a promoted grant when a terminal Stripe source follows elapsed access', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const expiredGrantSku = await createTestSku({ plan: 'plus' })
    const expiredGrant = await grantMembership(admin.id, user.id, 'plus', expiredGrantSku.id, 30)
    const promotedGrantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const promotedGrant = await grantMembership(admin.id, user.id, 'pro', promotedGrantSku.id, 30)
    await updateTestMembershipExpiresAt(expiredGrant.id, new Date('2020-01-01T00:00:00Z'))
    const terminalStripeSku = await createTestSku({ plan: 'plus' })

    const terminalStripeMembership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: terminalStripeSku.id,
      status: 'cancelled',
      stripeSubscriptionId: `sub_terminal_queued_grant_${user.id}`,
    })

    expect(terminalStripeMembership.projected).toBe(false)
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
    })
    await expect(getTestMembershipRaw(terminalStripeMembership.id)).resolves.toMatchObject({
      projection_ended_at: expect.any(Date),
      status: 'cancelled',
    })
    await expect(getMembershipHistory(user.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membership_id: terminalStripeMembership.id,
          change_type: 'cancellation',
          from_sku_id: terminalStripeSku.id,
          to_sku_id: terminalStripeSku.id,
        }),
      ]),
    )
    await expect(getTestGrantQueue(user.id)).resolves.toMatchObject({
      grant_ids: expect.arrayContaining([promotedGrant.grantId]),
      open_activation_count: 1,
    })
  })

  it('promotes B while C remains queued after elapsed A', async () => {
    const admin = await createTestUser({ administrator: true })
    const grantUser = await createTestUser()
    const firstSku = await createTestSku({ plan: 'plus' })
    const firstGrant = await grantMembership(admin.id, grantUser.id, 'plus', firstSku.id, 30)
    const promotedSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const promotedGrant = await grantMembership(admin.id, grantUser.id, 'pro', promotedSku.id, 30)
    await updateTestMembershipExpiresAt(firstGrant.id, new Date('2020-01-01T00:00:00Z'))
    const queuedSku = await createTestSku({ plan: 'plus' })
    const enqueueEntitlementEffects = vi.fn<() => void>()
    const queued = await createMembership(
      {
        userId: grantUser.id,
        plan: 'plus',
        skuId: queuedSku.id,
        grantedById: admin.id,
        durationDays: 30,
      },
      { enqueueDeliverMembershipEntitlementEffects: enqueueEntitlementEffects },
    )

    expect(queued.projected).toBe(false)
    expect(queued.grantId).toEqual(expect.any(String))
    await expect(getMembershipByUserId(grantUser.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
    })
    await expect(getTestGrantQueue(grantUser.id)).resolves.toMatchObject({
      grant_ids: expect.arrayContaining([promotedGrant.grantId, queued.grantId]),
      open_activation_count: 1,
    })
    await expect(getMembershipHistory(grantUser.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          change_type: 'admin_grant',
          to_plan: 'pro',
        }),
      ]),
    )
    expect(enqueueEntitlementEffects).toHaveBeenCalledOnce()
  })
})
