import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  acquireMembershipOperationalRetentionTestLock,
  createDeliveredMembershipEffectForRetention,
  createEndedMembershipRenewalNoticeForRetention,
  membershipEffectExists,
  membershipRenewalNoticeExists,
  readMembershipEntitlementRetentionCursor,
  resetMembershipOperationalRetentionCursor,
  restoreMembershipEntitlementRetentionCursor,
} from '@voucha/test-helpers/membership-operational-retention'
import {
  cleanupDeliveredMembershipEntitlementEffects,
  cleanupEndedMembershipRenewalNotices,
} from '../cleanup-membership-operational.mts'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { cleanupMembershipOperational } from '../cleanup-membership-operational-families.mts'

const DAY_MS = 86_400_000

describe('membership operational retention', () => {
  it('continues only the selected membership cleanup family', async () => {
    const lock = await acquireMembershipOperationalRetentionTestLock()
    onTestFinished(() => lock.release())
    await resetMembershipOperationalRetentionCursor('entitlement_effects')
    await resetMembershipOperationalRetentionCursor('renewal_notices')
    const user = await createTestUser()
    const dueAt = new Date(Date.now() - 150 * DAY_MS - Math.floor(Math.random() * DAY_MS))
    const effect = await createDeliveredMembershipEffectForRetention(user.id, dueAt)
    const noticeId = await createEndedMembershipRenewalNoticeForRetention(user.id, dueAt)

    const window = { batchSize: 100, maxBatches: 1, lowerBoundDate: new Date(dueAt.getTime() - 1) }
    const result = await cleanupMembershipOperational(
      {
        deliveredMembershipEntitlementEffects: window,
        endedMembershipRenewalNotices: window,
        terminalGooglePlayAcknowledgments: window,
      },
      ['deliveredMembershipEntitlementEffects'],
    )
    expect(result.deliveredMembershipEntitlementEffects.deleted).toBeGreaterThan(0)
    expect(result.endedMembershipRenewalNotices).toEqual({ deleted: 0, hasMore: false })
    expect(await membershipEffectExists(effect.effectId)).toBe(false)
    expect(await membershipRenewalNoticeExists(noticeId)).toBe(true)
  })

  it('deletes only delivered effects in a capped, resumable page', async () => {
    const lock = await acquireMembershipOperationalRetentionTestLock()
    onTestFinished(() => lock.release())
    await resetMembershipOperationalRetentionCursor('entitlement_effects')
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const laterUser = await createTestUser()
    const dueAt = new Date(Date.now() - 150 * DAY_MS - Math.floor(Math.random() * DAY_MS))
    const first = await createDeliveredMembershipEffectForRetention(firstUser.id, dueAt)
    const second = await createDeliveredMembershipEffectForRetention(secondUser.id, dueAt)
    const later = await createDeliveredMembershipEffectForRetention(
      laterUser.id,
      new Date(dueAt.getTime() + 1),
    )
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: dueAt,
      now: new Date(dueAt.getTime() + 30 * DAY_MS + 1),
    }
    expect(await cleanupDeliveredMembershipEntitlementEffects(options)).toEqual({
      deleted: 1,
      hasMore: true,
    })
    expect(await cleanupDeliveredMembershipEntitlementEffects(options)).toEqual({
      deleted: 1,
      hasMore: false,
    })
    expect(await membershipEffectExists(first.effectId)).toBe(false)
    expect(await membershipEffectExists(second.effectId)).toBe(false)
    expect(await membershipEffectExists(later.effectId)).toBe(true)
  })

  it('keeps the newer membership cursor and commits the older page deletion', async () => {
    const lock = await acquireMembershipOperationalRetentionTestLock()
    onTestFinished(() => lock.release())
    const priorCursor = await readMembershipEntitlementRetentionCursor()
    try {
      await resetMembershipOperationalRetentionCursor('entitlement_effects')
      const firstUser = await createTestUser()
      const secondUser = await createTestUser()
      const thirdUser = await createTestUser()
      const dueAt = new Date(Date.now() - 150 * DAY_MS)
      const first = await createDeliveredMembershipEffectForRetention(firstUser.id, dueAt)
      const second = await createDeliveredMembershipEffectForRetention(
        secondUser.id,
        new Date(dueAt.getTime() + 1),
      )
      const third = await createDeliveredMembershipEffectForRetention(
        thirdUser.id,
        new Date(dueAt.getTime() + 2),
      )
      const options = {
        batchSize: 1,
        maxBatches: 1,
        lowerBoundDate: dueAt,
        now: new Date(dueAt.getTime() + 30 * DAY_MS + 3),
        recordIds: [first.effectId, second.effectId, third.effectId],
      }
      const restore = beforePostgresTransactionQueryForTest(
        'deleteMembershipOperationalPage.entitlementDelete',
        values => Array.isArray(values[0]) && values[0].includes(first.effectId),
        async () => {
          expect(
            await cleanupDeliveredMembershipEntitlementEffects({
              ...options,
              recordIds: [second.effectId, third.effectId],
            }),
          ).toEqual({ deleted: 1, hasMore: true })
        },
      )
      try {
        const stale = await cleanupDeliveredMembershipEntitlementEffects({
          ...options,
          maxBatches: 2,
        })
        expect(await readMembershipEntitlementRetentionCursor()).toMatchObject({
          cursor_id: second.effectId,
        })
        expect(stale).toEqual({ deleted: 1, hasMore: false })
        expect(await membershipEffectExists(first.effectId)).toBe(false)
        expect(await membershipEffectExists(third.effectId)).toBe(true)
      } finally {
        restore()
      }
    } finally {
      await restoreMembershipEntitlementRetentionCursor(priorCursor)
    }
  })

  it('removes notices only after their membership projection has ended', async () => {
    const lock = await acquireMembershipOperationalRetentionTestLock()
    onTestFinished(() => lock.release())
    await resetMembershipOperationalRetentionCursor('renewal_notices')
    const user = await createTestUser()
    const endedAt = new Date(Date.now() - 150 * DAY_MS - Math.floor(Math.random() * DAY_MS))
    const membershipId = await createEndedMembershipRenewalNoticeForRetention(user.id, endedAt)
    expect(await membershipRenewalNoticeExists(membershipId)).toBe(true)
    expect(
      await cleanupEndedMembershipRenewalNotices({
        batchSize: 1,
        maxBatches: 1,
        lowerBoundDate: endedAt,
        now: new Date(endedAt.getTime() + 90 * DAY_MS + 1),
      }),
    ).toEqual({ deleted: 1, hasMore: false })
    expect(await membershipRenewalNoticeExists(membershipId)).toBe(false)
  })
})
