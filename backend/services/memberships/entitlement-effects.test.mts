import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  claimTestMembershipEntitlementEffect,
  createTestMembership,
  createTestUser,
  getTestMembershipEntitlementEffects,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import {
  claimPendingMembershipEntitlementEffects,
  completeMembershipEntitlementEffects,
  deliverPendingMembershipEntitlementEffects,
  recordMembershipEntitlementEffects,
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
      recordMembershipEntitlementEffects([{ membershipChangeId, userId: user.id }]),
    ).resolves.toBeUndefined()
    expect(await getTestMembershipEntitlementEffects(membershipChangeId)).toHaveLength(1)
  })

  it('never double-claims one effect across concurrent claimants', async () => {
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
    const changeId = rawMembership.latest_change_id
    const [effect] = await getTestMembershipEntitlementEffects(changeId)
    if (!effect) throw new Error('Expected entitlement effect')

    // Other claimants on a shared DB may legitimately take this effect first.
    const [firstClaims, secondClaims] = await Promise.all([
      claimPendingMembershipEntitlementEffects(10_000),
      claimPendingMembershipEntitlementEffects(10_000),
    ])
    const claimed = [...firstClaims, ...secondClaims].filter(claim => claim.id === effect.id)
    expect(claimed.length).toBeLessThanOrEqual(1)
    const [claim] = claimed
    if (!claim) return
    expect(await getTestMembershipEntitlementEffects(changeId)).toEqual([
      expect.objectContaining({
        delivered_at: null,
        delivery_claim_token: claim.deliveryClaimToken,
      }),
    ])
  })

  it('fences a stale claim token after lease takeover', async () => {
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
    const changeId = rawMembership.latest_change_id
    const [effect] = await getTestMembershipEntitlementEffects(changeId)
    if (!effect) throw new Error('Expected entitlement effect')

    const staleClaim = await claimTestMembershipEntitlementEffect(effect.id)
    const currentClaim = await claimTestMembershipEntitlementEffect(effect.id)
    expect(currentClaim.deliveryClaimToken).not.toBe(staleClaim.deliveryClaimToken)

    await expect(completeMembershipEntitlementEffects([staleClaim])).resolves.toBe(0)
    await expect(completeMembershipEntitlementEffects([currentClaim])).resolves.toBe(1)
    expect(await getTestMembershipEntitlementEffects(changeId)).toEqual([
      expect.objectContaining({ delivered_at: expect.any(Date), delivery_claim_token: null }),
    ])
  })

  it('leaves a leased effect to its claimant until durable completion', async () => {
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
    const changeId = rawMembership.latest_change_id
    const [effect] = await getTestMembershipEntitlementEffects(changeId)
    if (!effect) throw new Error('Expected entitlement effect')

    const claim = await claimTestMembershipEntitlementEffect(effect.id)

    // A global delivery cannot take this fresh lease, so it never touches the owned effect.
    await deliverPendingMembershipEntitlementEffects(10_000)
    expect(await getTestMembershipEntitlementEffects(changeId)).toEqual([
      expect.objectContaining({
        delivered_at: null,
        delivery_claim_token: claim.deliveryClaimToken,
      }),
    ])

    await expect(completeMembershipEntitlementEffects([claim])).resolves.toBe(1)
    expect(await getTestMembershipEntitlementEffects(changeId)).toEqual([
      expect.objectContaining({ delivered_at: expect.any(Date), delivery_claim_token: null }),
    ])
  })
})
