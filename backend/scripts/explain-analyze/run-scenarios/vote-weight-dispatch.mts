import { dispatchVoteWeightAgeMilestones } from '@services/vote-weight/dispatch-age-milestones'
import { dispatchVoteWeightMembershipExpirations } from '@services/vote-weight/dispatch-membership-expirations'
import { dispatchVoteWeightFamilySourceChanges } from '@services/vote-weight/dispatch-family-source-changes'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  VOTE_WEIGHT_DISPATCH_WINDOW_END,
  VOTE_WEIGHT_DISPATCH_WINDOW_START,
} from '../seed-data/vote-weight-dispatch.mts'

const window = {
  previousThroughAt: VOTE_WEIGHT_DISPATCH_WINDOW_START.toISOString(),
  windowStart: VOTE_WEIGHT_DISPATCH_WINDOW_START.toISOString(),
  windowEnd: VOTE_WEIGHT_DISPATCH_WINDOW_END.toISOString(),
}

const familyBranches = ['updated_at', 'effective_at', 'expires_at', 'rejected_at'] as const
const seededRows = {
  users: 20_244,
  memberships: 2_706,
  membership_sources: 2_706,
  membership_source_states: 2_706,
  membership_provider_observations: 2_400,
  membership_provider_evidence_records: 2_400,
}

export async function runVoteWeightDispatchScenarios(): Promise<void> {
  registerScenarioContract('vote-weight-age-milestones', {
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_users__vote_weight_age_milestone'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'users', max: 200 },
    ],
  })
  await runAndCapture(
    'vote-weight-age-milestones',
    () => dispatchVoteWeightAgeMilestones({ window, milestoneIndex: 0 }),
    undefined,
    'dispatchVoteWeightAgeMilestones',
  )

  registerScenarioContract('vote-weight-membership-expirations', {
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_memberships__vote_weight_expiry'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'memberships', max: 520 },
    ],
  })
  await runAndCapture(
    'vote-weight-membership-expirations',
    () => dispatchVoteWeightMembershipExpirations({ window }),
    undefined,
    'dispatchVoteWeightMembershipExpirations',
  )

  for (const branch of familyBranches.filter(branch => branch !== 'rejected_at')) {
    const scenarioId = `vote-weight-family-source-${branch}`
    registerScenarioContract(scenarioId, {
      seededRows,
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: [`idx_membership_source_states__family_${branch}`],
          noSort: true,
        },
        { kind: 'maxProcessedRows', relation: 'membership_source_states', max: 520 },
      ],
    })
    // no-mistakes-disable-next-line query-reached-per-item: fixed branch scenarios serialize process-global query capture
    await runAndCapture(
      scenarioId,
      () =>
        dispatchVoteWeightFamilySourceChanges({
          window:
            branch === 'updated_at'
              ? { ...window, windowStart: null, windowEnd: '2100-01-01T00:00:00Z' }
              : window,
          branches: Object.fromEntries(
            familyBranches.map(key => [key, key === branch ? undefined : null]),
          ),
        }),
      undefined,
      `dispatchVoteWeightFamilySourceChanges:${branch}`,
    )
  }

  for (const part of ['evidence', 'sources'] as const) {
    const scenarioId = `vote-weight-family-source-rejected_at-${part}`
    registerScenarioContract(scenarioId, {
      seededRows,
      expectations:
        part === 'evidence'
          ? [
              {
                kind: 'usesIndexes',
                indexes: ['idx_membership_provider_evidence_records__rejected_at'],
                noSort: true,
              },
              {
                kind: 'maxProcessedRows',
                relation: 'membership_provider_evidence_records',
                max: 2,
              },
            ]
          : [
              {
                kind: 'usesIndexes',
                indexes: ['idx_membership_source_states__observation_id'],
                noSort: true,
              },
              { kind: 'maxProcessedRows', relation: 'membership_source_states', max: 520 },
            ],
    })
    // no-mistakes-disable-next-line query-reached-per-item: fixed branch scenarios serialize process-global query capture
    await runAndCapture(
      scenarioId,
      () =>
        dispatchVoteWeightFamilySourceChanges({
          window,
          branches: Object.fromEntries(
            familyBranches.map(key => [key, key === 'rejected_at' ? undefined : null]),
          ),
        }),
      undefined,
      `dispatchVoteWeightFamilySourceChanges:rejected_at:${part}`,
    )
  }
}
