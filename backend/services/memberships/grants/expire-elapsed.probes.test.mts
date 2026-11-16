import {
  createTestAdminGrantMembership,
  createTestSku,
  createTestUser,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'
import { expireTestMembershipsThrough } from '@voucha/test-helpers/entities/membership-expiry'

describe('expireElapsedMemberships database boundary', () => {
  it.each([
    ['expiry one millisecond before the cutoff', -1, 1],
    ['expiry at the cutoff', 0, 1],
    ['expiry one millisecond after the cutoff', 1, 0],
  ] as const)('expires a grant %s', async (_label, expiryOffset, expectedExpired) => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const grant = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: sku.id,
      userId: member.id,
    })
    // The fixture grant is open-ended, so give it the 30-day term the writer would have set.
    await updateTestMembershipExpiresAt(grant.id, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
    const cutoff = (await getMembershipByUserId(member.id))?.expires_at
    if (!cutoff) throw new Error('Expected the owned grant to have a persisted expiry')
    await updateTestMembershipExpiresAt(grant.id, new Date(cutoff.getTime() + expiryOffset))

    await expect(expireTestMembershipsThrough(member.id, cutoff)).resolves.toMatchObject({
      expired: expectedExpired,
      hasMore: false,
    })

    const history = (await getMembershipHistory(member.id)).results
    expect(history.filter(change => change.change_type === 'expiration')).toHaveLength(
      expectedExpired,
    )
  })
})
