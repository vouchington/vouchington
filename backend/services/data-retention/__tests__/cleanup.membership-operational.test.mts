import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  acquireMembershipOperationalRetentionTestLock,
  createDeliveredMembershipEffectForRetention,
  createEndedMembershipRenewalNoticeForRetention,
  membershipEffectExists,
  membershipRenewalNoticeExists,
  resetMembershipOperationalRetentionCursor,
} from '@voucha/test-helpers/membership-operational-retention'
import {
  cleanupDeliveredMembershipEntitlementEffects,
  cleanupEndedMembershipRenewalNotices,
  runMembershipOperationalCleanupPage,
} from '../cleanup-membership-operational.mts'

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

    const result = await runMembershipOperationalCleanupPage(
      { batchSize: 100, maxBatches: 1 },
      {
        deliveredMembershipEntitlementEffects: true,
        endedMembershipRenewalNotices: false,
        terminalGooglePlayAcknowledgments: false,
      },
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
