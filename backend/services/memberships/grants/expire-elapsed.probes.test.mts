import { createTestSku, createTestUser, updateTestMembershipExpiresAt } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { grantMembership } from '../create.mts'
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
    const grant = await grantMembership(admin.id, member.id, 'plus', sku.id, 30)
    const cutoff = (await getMembershipByUserId(member.id))?.expires_at
    if (!cutoff) throw new Error('Expected the owned grant to have a persisted expiry')
    await updateTestMembershipExpiresAt(grant.id, new Date(cutoff.getTime() + expiryOffset))

    await expect(expireTestMembershipsThrough(member.id, cutoff)).resolves.toMatchObject({
      expired: expectedExpired,
      hasMore: false,
    })

    const history = await getMembershipHistory(member.id)
    expect(history.filter(change => change.change_type === 'expiration')).toHaveLength(
      expectedExpired,
    )
  })
})
