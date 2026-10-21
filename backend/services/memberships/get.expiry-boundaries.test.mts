import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { readTestMembershipAtExpiryOffset } from '@voucha/test-helpers/entities/membership-expiry'

describe('membership expiry at PostgreSQL transaction time', () => {
  it.each([
    ['expiry is one millisecond before PostgreSQL time', -1, false],
    ['expiry equals PostgreSQL time', 0, false],
    ['expiry is one millisecond after PostgreSQL time', 1, true],
  ] as const)('compares direct membership expiry: %s', async (_label, offset, active) => {
    const user = await createTestUser()
    const membership = await createTestMembership({
      effective_at: new Date('2020-01-01T00:00:00.000Z'),
      user_id: user.id,
    })
    const result = await readTestMembershipAtExpiryOffset(membership.id, user.id, offset)
    const activeMembership = expect.objectContaining({ status: 'active' })
    const activePlan = expect.objectContaining({ plan: 'plus' })
    expect(result.membership).toEqual(active ? activeMembership : null)
    expect(result.activeMembership).toEqual(active ? activePlan : null)
  })

  it.each([
    ['expiry is one millisecond before PostgreSQL time', -1, false],
    ['expiry equals PostgreSQL time', 0, false],
    ['expiry is one millisecond after PostgreSQL time', 1, true],
  ] as const)('compares family source expiry: %s', async (_label, offset, active) => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-expiry-${randomUUID()}`,
    })
    const membership = await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      effectiveAt: new Date('2020-01-01T00:00:00.000Z'),
      expiresAt: new Date('2031-01-01T00:00:00.000Z'),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceEffectiveAt: new Date('2020-01-01T00:00:00.000Z'),
      userId: user.id,
    })
    const result = await readTestMembershipAtExpiryOffset(membership.id, user.id, offset)
    const activeMembership = expect.objectContaining({ status: 'active' })
    const activePlan = expect.objectContaining({ plan: 'plus' })
    expect(result.membership).toEqual(active ? activeMembership : null)
    expect(result.activeMembership).toEqual(active ? activePlan : null)
  })
})
