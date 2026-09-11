import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ageTestMembershipEntitlementEffectClaim,
  createTestMembership,
  createTestUser,
  getTestMembershipEntitlementEffects,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { isJwtStale } from '@data-stores/valkey/jwt-stale'
import { voteWeightQueue } from '@queues/vote-weight/queues'
import {
  claimPendingMembershipEntitlementEffects,
  completeMembershipEntitlementEffects,
  deliverPendingMembershipEntitlementEffects,
  recordMembershipEntitlementEffect,
} from './entitlement-effects.mts'
import { recordMembershipChange } from './changes.mts'

describe('membership entitlement effects', () => {
  it('records one durable effect in the membership-change transaction', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')
    const membership = await createTestMembership({ user_id: user.id })

    await recordMembershipChange({
      membershipId: membership.id,
      userId: user.id,
      changeType: 'admin_grant',
    })

    const rawMembership = await getTestMembershipRaw(membership.id)
    if (!rawMembership?.latest_change_id) throw new Error('Expected recorded change')
    expect(await getTestMembershipEntitlementEffects(rawMembership.latest_change_id)).toEqual([
      expect.objectContaining({
        membership_change_id: rawMembership.latest_change_id,
        user_id: user.id,
        delivered_at: null,
        delivery_claim_token: null,
      }),
    ])
  })

  it('deduplicates effect recording by membership change', async () => {
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
    const membershipChangeId = rawMembership.latest_change_id

    await expect(
      recordMembershipEntitlementEffect(membershipChangeId, user.id),
    ).resolves.toBeUndefined()
    expect(await getTestMembershipEntitlementEffects(membershipChangeId)).toHaveLength(1)
  })

  it('allows one concurrent claim and fences stale completion after lease takeover', async () => {
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

    const [firstClaims, secondClaims] = await Promise.all([
      claimPendingMembershipEntitlementEffects(10_000),
      claimPendingMembershipEntitlementEffects(10_000),
    ])
    const claimed = [...firstClaims, ...secondClaims].filter(claim => claim.id === effect.id)
    expect(claimed).toHaveLength(1)
    const firstClaim = claimed[0]!

    await ageTestMembershipEntitlementEffectClaim(effect.id)
    const nextClaims = await claimPendingMembershipEntitlementEffects(10_000)
    const nextClaim = nextClaims.find(claim => claim.id === effect.id)
    if (!nextClaim) throw new Error('Expected stale lease takeover')
    expect(nextClaim.deliveryClaimToken).not.toBe(firstClaim.deliveryClaimToken)

    await expect(completeMembershipEntitlementEffects([firstClaim])).resolves.toBe(0)
    await expect(completeMembershipEntitlementEffects([nextClaim])).resolves.toBe(1)
    expect(await getTestMembershipEntitlementEffects(rawMembership.latest_change_id)).toEqual([
      expect.objectContaining({ delivered_at: expect.any(Date), delivery_claim_token: null }),
    ])
  })

  it('delivers an effect to Valkey and the vote-weight queue before durable completion', async () => {
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

    await expect(deliverPendingMembershipEntitlementEffects(10_000)).resolves.toBeGreaterThan(0)
    expect(await isJwtStale(user.id)).toBe(true)
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
})
