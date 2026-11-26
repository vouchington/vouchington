import assert from 'node:assert/strict'
import { getMembershipPendingState } from '@services/memberships/membership-overview-pending'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedMembershipPendingState } from '../seed-data/membership-pending-state-capacity.mts'

const scenario = 'membership-pending-state-at-default'
const queryNames = [
  'getMembershipPendingState.grants',
  'getMembershipPendingState.verifications',
  'getMembershipPendingState.operations',
]

export async function runMembershipPendingStateCapacity(): Promise<void> {
  // Retained membership facts remain in the disposable explain database. Run after the other
  // membership scenarios so the generated ledger and its statistics cannot influence their plans.
  const fixture = await seedMembershipPendingState()
  registerScenarioContract(scenario, {
    seededRows: fixture.seededRows,
    expectations: [
      {
        kind: 'queryBinds',
        token: 'LIMIT',
        queryContains: 'getMembershipPendingState.verifications',
      },
      { kind: 'queryBinds', token: 'LIMIT', queryContains: 'getMembershipPendingState.operations' },
      { kind: 'maxProcessedRows', relation: 'membership_grants', max: 100, captureIndex: 0 },
      { kind: 'maxFunctionCalls', function: 'fn_membership_grant_remaining_duration', max: 100 },
      { kind: 'maxProcessedRows', relation: 'membership_verifications', max: 64, captureIndex: 1 },
      // Main scans the operation corpus before isolating one member. Tighten after #6585.
      { kind: 'maxProcessedRows', relation: 'membership_operations', max: 7_664, captureIndex: 2 },
      { kind: 'maxProcessedRows', relation: 'membership_sources', max: 164, captureIndex: 2 },
      { kind: 'maxInputRows', nodeType: 'Sort', max: 64 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      assert.deepEqual(await getMembershipPendingState(fixture.userId), fixture.expected)
    },
    undefined,
    queryNames,
    { exactCapturedNames: queryNames },
  )
}
