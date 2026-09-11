import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ageTestMembershipEntitlementEffectClaim,
  claimTestMembershipEntitlementEffect,
  createTestMembership,
  createTestUser,
  getTestMembershipEntitlementEffects,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { markJwtStaleBatch } from '@data-stores/valkey/jwt-stale'
import { enqueueBulkRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import { voteWeightQueue } from '@queues/vote-weight/queues'
import { completeMembershipEntitlementEffects } from './entitlement-effects.mts'
import { recordMembershipChange } from './changes.mts'

describe('membership entitlement effect replay', () => {
  it('replays a claim abandoned after JWT invalidation without a global queue scan', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')
    const membership = await createTestMembership({ user_id: user.id })
    await recordMembershipChange({
      membershipId: membership.id,
      userId: user.id,
      changeType: 'admin_grant',
      note: randomUUID(),
    })
    const rawMembership = await getTestMembershipRaw(membership.id)
    if (!rawMembership?.latest_change_id) throw new Error('Expected recorded change')
    const [effect] = await getTestMembershipEntitlementEffects(rawMembership.latest_change_id)
    if (!effect) throw new Error('Expected entitlement effect')

    const interruptedClaim = await claimTestMembershipEntitlementEffect(effect.id)
    await markJwtStaleBatch([interruptedClaim.userId])
    expect(await getTestMembershipEntitlementEffects(rawMembership.latest_change_id)).toEqual([
      expect.objectContaining({
        delivered_at: null,
        delivery_claim_token: interruptedClaim.deliveryClaimToken,
      }),
    ])

    await ageTestMembershipEntitlementEffectClaim(effect.id)
    const replayClaim = await claimTestMembershipEntitlementEffect(effect.id)
    await enqueueBulkRecalculateUserVoteWeight([replayClaim.userId], true)
    await expect(completeMembershipEntitlementEffects([replayClaim])).resolves.toBe(1)

    expect(await getTestMembershipEntitlementEffects(rawMembership.latest_change_id)).toEqual([
      expect.objectContaining({ delivered_at: expect.any(Date), delivery_claim_token: null }),
    ])
    const jobs = (
      await Promise.all(
        (['waiting', 'active', 'completed', 'failed'] as const).map(state =>
          voteWeightQueue.getJobs(state, 0, -1),
        ),
      )
    ).flat()
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ data: { userId: user.id, forceRecalculate: true } }),
      ]),
    )
  })

  it('replays safely when both consumers finish before durable completion', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')
    const membership = await createTestMembership({ user_id: user.id })
    await recordMembershipChange({
      membershipId: membership.id,
      userId: user.id,
      changeType: 'admin_grant',
      note: randomUUID(),
    })
    const rawMembership = await getTestMembershipRaw(membership.id)
    if (!rawMembership?.latest_change_id) throw new Error('Expected recorded change')
    const [effect] = await getTestMembershipEntitlementEffects(rawMembership.latest_change_id)
    if (!effect) throw new Error('Expected entitlement effect')

    const interruptedClaim = await claimTestMembershipEntitlementEffect(effect.id)
    await markJwtStaleBatch([interruptedClaim.userId])
    await enqueueBulkRecalculateUserVoteWeight([interruptedClaim.userId], true)

    await ageTestMembershipEntitlementEffectClaim(effect.id)
    const replayClaim = await claimTestMembershipEntitlementEffect(effect.id)
    await markJwtStaleBatch([replayClaim.userId])
    await enqueueBulkRecalculateUserVoteWeight([replayClaim.userId], true)
    await expect(completeMembershipEntitlementEffects([replayClaim])).resolves.toBe(1)

    expect(await getTestMembershipEntitlementEffects(rawMembership.latest_change_id)).toEqual([
      expect.objectContaining({ delivered_at: expect.any(Date), delivery_claim_token: null }),
    ])
  })
})
