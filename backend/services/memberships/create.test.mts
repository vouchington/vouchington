import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  createTestUser,
  createTestSku,
  createRetiredTestSku,
  getTestGrantQueue,
  getTestMembershipRaw,
  restoreUser,
  softDeleteUser,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import {
  createMembership,
  grantMembership,
  InvalidMembershipGrantSkuError,
  InvalidMembershipGrantUserError,
} from './create.mts'
import { getMembershipByUserId, getMembershipHistory } from './get.mts'

describe('create', () => {
  let user: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    admin = await createTestUser({ administrator: true })
  })
  describe('createMembership', () => {
    it('creates a membership with required fields', async () => {
      const sku = await createTestSku()
      const result = await createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        durationDays: 30,
      })
      expect(result.id).toBeDefined()
      const membership = await getMembershipByUserId(user.id)
      expect(membership).not.toBeNull()
      expect(membership!.plan).toBe('plus')
      expect(membership!.status).toBe('active')

      const history = await getMembershipHistory(user.id)
      expect(history[0].membership_id).toBe(result.id)
      expect(history[0].change_type).toBe('admin_grant')
    })

    it('creates a membership with stripe fields', async () => {
      const user2 = await createTestUser()
      const sku = await createTestSku()
      const expiresAt = new Date('2030-01-01T00:00:00.000Z')
      const random = Math.random().toString(36).slice(2, 15)
      const result = await createMembership({
        userId: user2.id,
        plan: 'plus',
        skuId: sku.id,
        expiresAt,
        stripeSubscriptionId: `sub_test_${random}`,
        stripeCustomerId: `cus_test_${random}`,
      })
      expect(result.id).toBeDefined()
      const membership = await getTestMembershipRaw(result.id)
      expect(membership?.expires_at?.toISOString()).toBe(expiresAt.toISOString())
    })

    it('maps a deleted admin grant recipient to the domain error', async () => {
      const deletedUser = await createTestUser()
      const sku = await createTestSku()
      try {
        await softDeleteUser(deletedUser.id)
        await expect(
          createMembership({
            userId: deletedUser.id,
            plan: 'plus',
            skuId: sku.id,
            durationDays: 30,
          }),
        ).rejects.toBeInstanceOf(InvalidMembershipGrantUserError)
      } finally {
        await restoreUser(deletedUser.id)
      }
    })

    it('replaces an elapsed grant with a new Stripe membership', async () => {
      const stripeUser = await createTestUser()
      const grantSku = await createTestSku({ plan: 'plus' })
      const elapsedGrant = await grantMembership(admin.id, stripeUser.id, 'plus', grantSku.id, 30)
      await updateTestMembershipExpiresAt(elapsedGrant.id, new Date('2020-01-01T00:00:00Z'))
      const stripeSku = await createTestSku({ plan: 'pro' })
      const stripeMembership = await createMembership({
        userId: stripeUser.id,
        plan: 'pro',
        skuId: stripeSku.id,
        expiresAt: new Date('2030-01-01T00:00:00Z'),
        stripeSubscriptionId: `sub_elapsed_grant_${stripeUser.id}`,
        stripeCustomerId: `cus_elapsed_grant_${stripeUser.id}`,
      })

      const elapsedProjection = await getTestMembershipRaw(elapsedGrant.id)
      expect(elapsedProjection?.expired_at).toEqual(expect.any(Date))
      const expirationChange = (await getMembershipHistory(stripeUser.id)).find(
        change => change.membership_id === elapsedGrant.id && change.change_type === 'expiration',
      )
      expect(expirationChange?.expired_at).toEqual(elapsedProjection?.expired_at)
      await expect(getMembershipByUserId(stripeUser.id)).resolves.toMatchObject({
        id: stripeMembership.id,
        plan: 'pro',
        status: 'active',
      })
    })

    it('creates a membership with scheduled period-end cancellation', async () => {
      const cancelUser = await createTestUser()
      const sku = await createTestSku()
      const result = await createMembership({
        userId: cancelUser.id,
        plan: 'plus',
        skuId: sku.id,
        cancelAtPeriodEnd: true,
        stripeSubscriptionId: `sub_scheduled_cancel_${cancelUser.id}`,
      })

      const membership = await getTestMembershipRaw(result.id)
      expect(membership?.cancel_at_period_end).toBe(true)
      expect(await getMembershipHistory(cancelUser.id)).toEqual([
        expect.objectContaining({
          membership_id: result.id,
          change_type: 'renewal',
          cancel_at_period_end: true,
        }),
      ])
    })

    it('clears scheduled cancellation for initial terminal statuses', async () => {
      const cancelUser = await createTestUser()
      const sku = await createTestSku()
      const result = await createMembership({
        userId: cancelUser.id,
        plan: 'plus',
        skuId: sku.id,
        status: 'cancelled',
        stripeSubscriptionId: `sub_cancelled_${cancelUser.id}`,
        cancelAtPeriodEnd: true,
      })

      const membership = await getTestMembershipRaw(result.id)
      expect(membership?.status).toBe('cancelled')
      expect(membership?.cancel_at_period_end).toBe(false)
      expect(membership?.source_auto_renews).toBe(false)
      expect(await getMembershipHistory(cancelUser.id)).toEqual([
        expect.objectContaining({
          membership_id: result.id,
          change_type: 'cancellation',
          cancelled_at: expect.any(Date),
          cancel_at_period_end: false,
        }),
      ])
    })
  })

  describe('grantMembership', () => {
    it('rejects a nonexistent grant recipient without creating a source', async () => {
      const sku = await createTestSku({ plan: 'plus' })
      await expect(
        grantMembership(admin.id, randomUUID(), 'plus', sku.id, 30),
      ).rejects.toBeInstanceOf(InvalidMembershipGrantUserError)
    })
    it('rejects retired SKUs inside the grant transaction', async () => {
      const retiredSku = await createRetiredTestSku({ plan: 'pro' })
      const retiredSkuUser = await createTestUser()
      const existingSku = await createTestSku({ plan: 'plus' })
      const existing = await grantMembership(
        admin.id,
        retiredSkuUser.id,
        'plus',
        existingSku.id,
        30,
      )
      await expect(
        grantMembership(admin.id, retiredSkuUser.id, 'pro', retiredSku.id, 30),
      ).rejects.toThrow(InvalidMembershipGrantSkuError)
      await expect(getMembershipByUserId(retiredSkuUser.id)).resolves.toMatchObject({
        id: existing.id,
        plan: 'plus',
      })
    })

    it('rejects SKUs for a different plan inside the grant transaction', async () => {
      const plusSku = await createTestSku({ plan: 'plus' })
      const mismatchedPlanUser = await createTestUser()

      await expect(
        grantMembership(admin.id, mismatchedPlanUser.id, 'pro', plusSku.id, 30),
      ).rejects.toThrow(InvalidMembershipGrantSkuError)
      await expect(getMembershipByUserId(mismatchedPlanUser.id)).resolves.toBeNull()
    })

    it('persists the caller-requested calendar duration and derived expiry', async () => {
      const grantUser = await createTestUser()
      const sku = await createTestSku({ plan: 'plus' })
      const startedAt = Date.now()

      const grant = await grantMembership(admin.id, grantUser.id, 'plus', sku.id, 31)
      const membership = await getTestMembershipRaw(grant.id)

      expect(membership).toMatchObject({ calendar_days: 31 })
      expect(membership!.expires_at!.getTime()).toBeGreaterThanOrEqual(
        startedAt + 31 * 24 * 60 * 60 * 1000 - 2_000,
      )
    })

    it('queues a second grant FIFO while one is open', async () => {
      const replaceUser = await createTestUser()
      const oldSku = await createTestSku({ plan: 'plus' })
      const oldResult = await grantMembership(admin.id, replaceUser.id, 'plus', oldSku.id, 30)
      const newSku = await createTestSku({ plan: 'pro' })
      const queuedGrant = await grantMembership(admin.id, replaceUser.id, 'pro', newSku.id, 30)
      expect(queuedGrant).toMatchObject({ id: oldResult.id, queued: true })
      await expect(getTestMembershipRaw(queuedGrant.grantId)).resolves.toBeUndefined()
      await expect(getMembershipByUserId(replaceUser.id)).resolves.toMatchObject({
        id: oldResult.id,
        plan: 'plus',
        status: 'active',
      })
      await expect(getTestGrantQueue(replaceUser.id)).resolves.toMatchObject({
        grant_ids: expect.arrayContaining([queuedGrant.grantId]),
        open_activation_count: 1,
      })
    })

    it('replaces an elapsed grant with a new grant', async () => {
      const elapsedUser = await createTestUser()
      const oldSku = await createTestSku({ plan: 'plus' })
      const oldGrant = await grantMembership(admin.id, elapsedUser.id, 'plus', oldSku.id, 30)
      await updateTestMembershipExpiresAt(oldGrant.id, new Date('2020-01-01T00:00:00Z'))
      const newSku = await createTestSku({ plan: 'pro' })

      const newGrant = await grantMembership(admin.id, elapsedUser.id, 'pro', newSku.id, 30)

      await expect(getMembershipByUserId(elapsedUser.id)).resolves.toMatchObject({
        id: newGrant.id,
        plan: 'pro',
        status: 'active',
      })
      const history = await getMembershipHistory(elapsedUser.id)
      expect(history.map(change => change.change_type)).toEqual(
        expect.arrayContaining(['expiration', 'admin_grant']),
      )
    })

    it('with note field: note appears in membership history', async () => {
      const noteUser = await createTestUser()
      const sku = await createTestSku({ plan: 'plus' })
      await grantMembership(admin.id, noteUser.id, 'plus', sku.id, 30, {
        note: 'Complimentary access for beta tester',
      })
      const history = await getMembershipHistory(noteUser.id)
      expect(history.length).toBeGreaterThanOrEqual(1)
      const latestChange = history[0]
      expect(latestChange.note).toBe('Complimentary access for beta tester')
      expect(latestChange.change_type).toBe('admin_grant')
    })

    it('records correct from/to plan in change history when replacing', async () => {
      const historyUser = await createTestUser()

      // Grant initial plus membership
      const plusSku = await createTestSku({ plan: 'plus' })
      const first = await grantMembership(admin.id, historyUser.id, 'plus', plusSku.id, 30)
      await updateTestMembershipExpiresAt(first.id, new Date('2020-01-01T00:00:00Z'))
      const proSku = await createTestSku({ plan: 'pro' })
      const secondResult = await grantMembership(admin.id, historyUser.id, 'pro', proSku.id, 30)
      const history = await getMembershipHistory(historyUser.id)
      const replacementChange = history[0]
      expect(replacementChange.change_type).toBe('admin_grant')
      expect(replacementChange.from_plan).toBe('plus')
      expect(replacementChange.to_plan).toBe('pro')
      expect(replacementChange.cancelled_at).toBeNull()
      expect(replacementChange.expired_at).toBeNull()
      expect(replacementChange.past_due_at).toBeNull()
      expect(replacementChange.paused_at).toBeNull()
      expect(replacementChange.membership_id).toBe(secondResult.id)
    })
  })
})
