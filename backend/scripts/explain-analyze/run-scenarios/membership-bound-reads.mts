import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { selectDirectTerminationReplacement } from '@services/memberships/grants/select-direct-termination-replacement'
import { getMembershipRefundTargetByStripeSubscriptionId } from '@services/memberships/refunds/source-lookup'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  MEMBERSHIP_BOUND_READ_COUNT,
  membershipBoundReadFixture as fixture,
  seedMembershipBoundReads,
} from '../seed-data/membership-bound-reads.mts'

export async function runMembershipBoundReadScenarios(): Promise<void> {
  const originatedAt = await seedMembershipBoundReads()
  registerScenarioContract('membership-direct-replacement-heavy-owner', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'membership_grants', max: MEMBERSHIP_BOUND_READ_COUNT },
    ],
    seededRows: { membership_grants: MEMBERSHIP_BOUND_READ_COUNT },
  })
  await runAndCapture(
    'membership-direct-replacement-heavy-owner',
    async () => {
      await using query = await beginTransaction()
      const replacement = await selectDirectTerminationReplacement(
        fixture.grantUserId,
        '00000000-0000-7000-8000-000000000000',
        query,
      )
      assert.equal(replacement?.membership_source_id, fixture.grantWinnerSourceId)
      return replacement
    },
    undefined,
    'resumeGrantAfterDirectTermination: replacement priority',
  )
  await captureRefundTargetCase(
    'membership-refund-target-heavy-current',
    fixture.currentSubscriptionId,
    fixture.currentMembershipId,
    originatedAt,
  )
  await captureRefundTargetCase(
    'membership-refund-target-heavy-history',
    fixture.historicalSubscriptionId,
    fixture.historicalMembershipId,
    originatedAt,
  )
}

async function captureRefundTargetCase(
  id: string,
  subscriptionId: string,
  membershipId: string,
  originatedAt: Date,
): Promise<void> {
  registerScenarioContract(id, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'memberships', max: MEMBERSHIP_BOUND_READ_COUNT },
      {
        kind: 'maxProcessedRows',
        relation: 'membership_changes',
        max: MEMBERSHIP_BOUND_READ_COUNT,
      },
    ],
    seededRows: {
      memberships: 2 * MEMBERSHIP_BOUND_READ_COUNT,
      membership_changes: 2 * MEMBERSHIP_BOUND_READ_COUNT,
    },
  })
  await runAndCapture(
    id,
    async () => {
      const target = await getMembershipRefundTargetByStripeSubscriptionId(
        subscriptionId,
        'test',
        originatedAt,
        { applicationId: fixture.applicationId },
      )
      assert.equal(target?.membershipId, membershipId)
      return target
    },
    undefined,
    'getMembershipRefundTargetByStripeSubscriptionId',
  )
}
