import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { createTestSku, createTestUser, getTestMembershipRaw } from '@voucha/test-helpers'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import {
  createMembership,
  getRetainedDirectMembershipSourceByStripeIdentity,
} from '@services/memberships'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { reconcileStripeMembershipSource } from '../reconcile-source.mts'

describe('reconcileStripeMembershipSource retained source database failure', () => {
  it('rethrows an unexpected restoration failure and preserves the retained projection', async () => {
    const member = await createTestUser()
    const applicationId = `test-retained-failure-${randomUUID()}`
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const sourceIdentity = getStripeMembershipSourceIdentity({
      stripeSubscriptionId: `sub_retained_failure_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const membership = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: sku.id,
      status: 'paused',
      stripeSubscriptionId: sourceIdentity.providerLineageId,
      providerApplicationId: applicationId,
    })
    const retained = await getRetainedDirectMembershipSourceByStripeIdentity(sourceIdentity)
    expect(retained).not.toBeNull()
    const before = await getTestMembershipRaw(membership.id)

    const { result, error } = await withPostgresQueryFailureForTest(
      '/* getActiveMembershipProduct */',
      () =>
        withPostgresTransactionForTest(query =>
          reconcileStripeMembershipSource(
            `evt_retained_failure_${randomUUID()}`,
            null,
            sourceIdentity,
            {
              status: 'active',
              plan: 'plus',
              skuId: sku.id,
              expiresAt: undefined,
              effectiveAt: undefined,
              currentPeriodStart: undefined,
              terminalEffectiveAt: undefined,
              cancelAtPeriodEnd: false,
            },
            retained,
            query,
          ).catch((err: unknown) => err),
        ),
      { command: 'SELECT' },
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(result).toBe(error)
    await expect(getTestMembershipRaw(membership.id)).resolves.toEqual(before)
  })
})
