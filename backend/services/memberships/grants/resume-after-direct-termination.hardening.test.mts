import { describe, expect, it } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipGrantActivations,
  getTestMembershipGrantRemainingMilliseconds,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../create.mts'
import { getMembershipByUserId } from '../get.mts'

describe('terminal-first direct terms', () => {
  it('preserves only the non-direct portion of an active grant', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    const [grantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(grantId).toBeDefined()
    const remainingBefore = await getTestMembershipGrantRemainingMilliseconds(grantId!)
    const terminalSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const effectiveAt = new Date()
    const terminalEffectiveAt = new Date(effectiveAt.getTime() + 1)

    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: terminalSku.id,
      stripeSubscriptionId: `sub_terminal_first_direct_${member.id}`,
      status: 'cancelled',
      effectiveAt,
      terminalEffectiveAt,
    })

    const remainingAfter = await getTestMembershipGrantRemainingMilliseconds(grantId!)
    // membership_grant_remaining_duration() is computed from now() in Postgres, so this
    // tolerance must absorb real wall-clock drift from the createTestSku/createMembership
    // writes between the two reads.
    expect(remainingAfter).toBeGreaterThan((remainingBefore ?? 0) - 1000)
    await expect(getTestMembershipGrantActivations(grantId!)).resolves.toEqual([
      expect.objectContaining({ ended_at: effectiveAt }),
      expect.objectContaining({ started_at: terminalEffectiveAt, ended_at: null }),
    ])
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      id: grant.id,
      plan: 'plus',
      status: 'active',
    })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      active_grant_ids: [grantId],
      open_activation_count: 1,
    })
  })
})
