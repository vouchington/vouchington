import { describe, it, expect } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  createTestUserDirect,
  createTestUserWithId,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { gatherVoteWeightFactors } from './gather-factors.mts'

const randomUsername = () => `test-vote-weight-gather-${randomBytes(4).toString('hex')}`

describe('gatherVoteWeightFactors', () => {
  it('returns null for a non-existent user', async () => {
    const fakeId = '00000000-0000-7000-8000-000000000001'
    const result = await gatherVoteWeightFactors(fakeId)
    expect(result).toBeNull()
  }, 60_000)

  it('returns factors for a basic user with correct defaults', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    const factors = await gatherVoteWeightFactors(userId)

    expect(factors).not.toBeNull()
    expect(factors!.oauthCount).toBe(0)
    expect(factors!.oauthOlderThan1Year).toBe(0)
    expect(factors!.oauthOlderThan5Years).toBe(0)
    expect(factors!.membershipPlan).toBeNull()
    expect(factors!.isAdmin).toBe(false)
    expect(factors!.accountCreatedAt).toBeInstanceOf(Date)
    expect(typeof factors!.distinctAuthMethodCount).toBe('number')
    expect(typeof factors!.current_weight).toBe('number')
    expect(factors!.penaltyMultiplier).toBe(1.0)
  }, 60_000)

  it('returns a valid Date for accountCreatedAt when user has a non-UUIDv7 id (COALESCE regression)', async () => {
    // UUIDv4 ids have no embedded timestamp; uuid_extract_timestamp() returns null for them.
    // The COALESCE in gather-factors.mts should fall back to CURRENT_TIMESTAMP.
    const v4Id = randomUUID() // crypto.randomUUID() always produces a v4 UUID
    const username = randomUsername()
    await createTestUserWithId(v4Id, username)

    const factors = await gatherVoteWeightFactors(v4Id)

    expect(factors).not.toBeNull()
    expect(factors!.accountCreatedAt).toBeInstanceOf(Date)
    expect(isNaN(factors!.accountCreatedAt.getTime())).toBe(false)
  }, 60_000)

  it('returns isAdmin=true for a user with the administrator role', async () => {
    const user = await createTestUserDirect({
      username: randomUsername(),
      administrator: true,
    })
    const userId = user!.id

    const factors = await gatherVoteWeightFactors(userId)

    expect(factors).not.toBeNull()
    expect(factors!.isAdmin).toBe(true)
  }, 60_000)

  it('excludes an elapsed finite grant from membership factors', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const membership = await createTestMembership({ user_id: user!.id, plan: 'plus' })
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))
    await expect(gatherVoteWeightFactors(user!.id)).resolves.toMatchObject({
      membershipPlan: null,
    })
  }, 60_000)

  it('retains an elapsed Stripe subscription in membership factors', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const membership = await createTestMembership({
      user_id: user!.id,
      plan: 'plus',
      stripe_subscription_id: `sub_lapsed_vote_${randomBytes(4).toString('hex')}`,
    })
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))
    await expect(gatherVoteWeightFactors(user!.id)).resolves.toMatchObject({
      membershipPlan: 'plus',
    })
  }, 60_000)

  it('excludes an invalid family source from membership factors', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `vote-weight-family-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      sourceStatus: 'paused',
      userId: user!.id,
    })

    await expect(gatherVoteWeightFactors(user!.id)).resolves.toMatchObject({
      membershipPlan: null,
    })
  }, 60_000)
})
