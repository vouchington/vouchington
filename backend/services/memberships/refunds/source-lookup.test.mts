import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  deleteTestMembershipProjectionForRefundSource,
  insertTestRefundSourceBoundaryChange,
  releaseMembershipSourceForRebindForTest,
} from '@voucha/test-helpers'
import { getMembershipRefundTargetByStripeSubscriptionId } from './source-lookup.mts'

const BOUNDARY = Date.parse('2080-01-01T00:00:00.000Z')
const cases = (['lower', 'upper'] as const).flatMap(edge =>
  [false, true].flatMap(fractional =>
    [-1, 0, 1].map(offset => ({
      edge,
      fractional,
      offset,
      matches: edge === 'lower' ? offset >= (fractional ? 1 : 0) : offset < (fractional ? 1 : 0),
    })),
  ),
)

describe('refund source change boundaries', () => {
  it.each(cases)(
    '$edge fractional=$fractional at millisecond offset $offset',
    async ({ edge, fractional, offset, matches }) => {
      const user = await createTestUser()
      const subscriptionId = `sub_refund_boundary_${randomUUID()}`
      const applicationId = `refund-boundary-${randomUUID()}`
      const sku = await createTestSku({ provider_application_id: applicationId })
      const boundary = `2080-01-01T00:00:00.${fractional ? '000500' : '000000'}Z`
      const membership = await createTestMembership({
        user_id: user.id,
        stripe_subscription_id: subscriptionId,
        provider_environment: 'production',
        provider_application_id: applicationId,
        sku_id: sku.id,
        binding_bound_at: edge === 'lower' ? boundary : new Date(BOUNDARY - 1000),
      })
      if (edge === 'upper') {
        await releaseMembershipSourceForRebindForTest(membership.membership_source_id, boundary)
      } else {
        // Leave released_at NULL while exercising history fallback, without a current projection.
        await deleteTestMembershipProjectionForRefundSource(membership.membership_source_id)
      }
      // Each distinct retained membership identity makes the selected history target_id observable.
      // One candidate per owned source keeps every boundary independently visible.
      const target = await insertTestRefundSourceBoundaryChange({
        sourceId: membership.membership_source_id,
        userId: user.id,
        at: new Date(BOUNDARY + offset),
      })
      const selected = await getMembershipRefundTargetByStripeSubscriptionId(
        subscriptionId,
        'production',
        new Date(BOUNDARY - 500),
        { applicationId },
      )
      expect(selected).toEqual(
        matches
          ? {
              membershipId: target.membershipId,
              userId: user.id,
              membershipSourceId: membership.membership_source_id,
            }
          : null,
      )
    },
  )

  it('keeps a current projection ahead of a newer history target with no release', async () => {
    const user = await createTestUser()
    const subscriptionId = `sub_refund_current_${randomUUID()}`
    const applicationId = `refund-current-${randomUUID()}`
    const sku = await createTestSku({ provider_application_id: applicationId })
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: subscriptionId,
      provider_environment: 'production',
      provider_application_id: applicationId,
      sku_id: sku.id,
      binding_bound_at: new Date(BOUNDARY),
    })
    await insertTestRefundSourceBoundaryChange({
      sourceId: membership.membership_source_id,
      userId: user.id,
      at: new Date(BOUNDARY + 1),
    })
    expect(
      await getMembershipRefundTargetByStripeSubscriptionId(
        subscriptionId,
        'production',
        new Date(BOUNDARY),
        { applicationId },
      ),
    ).toEqual({
      membershipId: membership.id,
      userId: user.id,
      membershipSourceId: membership.membership_source_id,
    })
  })
})
