import { describe, expect, it } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { createMembership, grantMembership } from './create.mts'
import { getMembershipHistory } from './get.mts'

describe('direct membership change classification', () => {
  it('records a higher-tier grant to direct transition as an upgrade', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    const directSku = await createTestSku({ plan: 'pro' })

    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      stripeSubscriptionId: `sub_direct_change_${member.id}`,
    })

    const change = (await getMembershipHistory(member.id)).find(
      candidate => candidate.membership_id === direct.id,
    )
    expect(change).toMatchObject({
      change_type: 'upgrade',
      from_plan: 'plus',
      to_plan: 'pro',
    })
  })
})
