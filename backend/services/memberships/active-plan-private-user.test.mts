import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  rejectTestMembershipProviderEvidence,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { getPrivateUserByAny } from '../users/get.mts'
import { getUserActivePlan } from './get.mts'

const elapsed = () => new Date(Date.now() - 60_000)

type Seed = (userId: string) => Promise<void>

const directSeed =
  (status: 'active' | 'past_due' | 'cancelled' | 'expired' | 'paused', stale = false): Seed =>
  async userId => {
    const membership = await createTestMembership({
      user_id: userId,
      plan: 'pro',
      status,
      stripe_customer_id: `cus_${randomUUID()}`,
    })
    if (stale) await updateTestMembershipExpiresAt(membership.id, elapsed())
  }

const grantSeed =
  (options: { elapsed?: boolean; ended?: boolean; status?: 'active' | 'past_due' } = {}): Seed =>
  async userId => {
    const membership = await createTestMembership({
      user_id: userId,
      plan: 'plus',
      status: options.status ?? 'active',
    })
    if (options.elapsed) await updateTestMembershipExpiresAt(membership.id, elapsed())
    if (options.ended) await endTestMembershipProjection(membership.id)
  }

const familySeed =
  (options: { rejected?: boolean; elapsed?: boolean } = {}): Seed =>
  async userId => {
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `active-plan-family-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      userId,
    })
    if (options.rejected) await rejectTestMembershipProviderEvidence(family.id)
    if (options.elapsed) await updateTestMembershipExpiresAt(family.id, elapsed())
  }

const cases: Array<[string, Seed, 'plus' | 'pro' | null]> = [
  ['no membership', async () => {}, null],
  ['active direct source', directSeed('active'), 'pro'],
  ['past_due direct source', directSeed('past_due'), 'pro'],
  ['stale direct period end', directSeed('active', true), 'pro'],
  ['cancelled (what a refund revoking access leaves)', directSeed('cancelled'), null],
  ['expired', directSeed('expired'), null],
  ['paused', directSeed('paused'), null],
  ['administrator grant without expiry', grantSeed(), 'plus'],
  ['past_due administrator grant', grantSeed({ status: 'past_due' }), 'plus'],
  ['administrator grant expired by date', grantSeed({ elapsed: true }), null],
  ['ended projection', grantSeed({ ended: true }), null],
  ['valid family source', familySeed(), 'plus'],
  ['family source with rejected provider evidence', familySeed({ rejected: true }), null],
  ['family source expired by date', familySeed({ elapsed: true }), null],
]

describe('private user membership_plan matches the active plan lookup', () => {
  it.each(cases)('%s', async (_name, seed, expected) => {
    const user = await createTestUser()
    await seed(user.id)

    const privateUser = await getPrivateUserByAny(user.id, { readOnly: false })
    const activePlan = await getUserActivePlan(user.id, { readOnly: false })

    expect(activePlan).toBe(expected)
    expect(privateUser?.membership_plan ?? null).toBe(expected)
  })
})
