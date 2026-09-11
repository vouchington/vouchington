import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from './create.mts'
import { getMembershipByUserId } from './get.mts'

describe('administrator grants behind direct memberships', () => {
  it('queues the grant without replacing the paid projection', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const directSku = await createTestSku({ plan: 'plus' })
    const direct = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: directSku.id,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      stripeSubscriptionId: `sub_direct_${randomUUID()}`,
    })
    const grantSku = await createTestSku({ plan: 'pro' })

    const grant = await grantMembership(admin.id, user.id, 'pro', grantSku.id, 30, {
      note: 'Queues behind paid access',
    })

    expect(grant).toMatchObject({ id: direct.id, queued: true })
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      id: direct.id,
      plan: 'plus',
      status: 'active',
    })
    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({ expired_at: null })
    await expect(getTestMembershipRaw(grant.grantId)).resolves.toBeUndefined()
    await expect(getTestGrantQueue(user.id)).resolves.toMatchObject({
      grant_ids: expect.arrayContaining([grant.grantId]),
      grant_notes: expect.arrayContaining(['Queues behind paid access']),
      open_activation_count: 0,
    })
  })
})
