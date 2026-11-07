import { searchCommunityMembers } from '@services/communities/members/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID } from '../seed-data/community-membership-caps.mts'

/** Eligible ID pages use membership indexes before hydrating the returned rows by primary key. */
export async function runCommunityMemberRolePageScenarios(): Promise<void> {
  const communityId = COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID
  const boundedRoleIndexes = [
    'community_members_pkey',
    'idx_community_members__active_community_role_id',
    'idx_community_members__active_community_id_id',
    'idx_community_members__active_moderators',
    'idx_community_members__moderator_community_id',
  ]
  const scenarios = [
    {
      id: 'search-community-members-owner-role',
      maxMembers: 160,
      maxUsers: 80,
      run: () => searchCommunityMembers(communityId, { limit: 25, role: 'owner' }),
    },
    {
      id: 'search-community-members-moderator-role',
      maxMembers: 160,
      maxUsers: 80,
      run: () => searchCommunityMembers(communityId, { limit: 25, role: 'moderator' }),
    },
    {
      id: 'search-community-members-moderator-roster',
      // Fixture churn can make custom plans prefer a PK scan: measured 1,053
      // inspected memberships plus 26 final-row hydrations; generic plans use an index.
      maxMembers: 1500,
      // The sorted staff cohort can validate all 100 users before the final page.
      maxUsers: 120,
      run: () => searchCommunityMembers(communityId, { limit: 25, rosterVisibility: 'moderators' }),
    },
  ] as const
  for (const scenario of scenarios) {
    registerScenarioContract(scenario.id, {
      expectations: [
        { kind: 'usesIndexes', indexes: boundedRoleIndexes, anyOf: true },
        { kind: 'maxProcessedRows', relation: 'community_members', max: scenario.maxMembers },
        { kind: 'maxProcessedRows', relation: 'users', max: scenario.maxUsers },
      ],
    })
    await runAndCapture(scenario.id, scenario.run)
  }
}
