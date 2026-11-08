import { searchCommunityMembers } from '@services/communities/members/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID } from '../seed-data/community-membership-caps.mts'

/** Eligible ID pages use membership indexes before hydrating the returned rows by primary key. */
export async function runCommunityMemberRolePageScenarios(): Promise<void> {
  const communityId = COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID
  const boundedRoleIndexes = [
    'idx_community_members__owner_community_id_id',
    'idx_community_members__active_community_role_id',
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
      // Each eligible role walk has its own page limit before the ordered merge.
      maxMembers: 240,
      maxUsers: 80,
      run: () => searchCommunityMembers(communityId, { limit: 25, rosterVisibility: 'moderators' }),
    },
  ] as const
  for (const scenario of scenarios) {
    registerScenarioContract(scenario.id, {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes:
            scenario.id === 'search-community-members-owner-role'
              ? ['idx_community_members__owner_community_id_id']
              : boundedRoleIndexes,
          anyOf: true,
        },
        { kind: 'maxProcessedRows', relation: 'community_members', max: scenario.maxMembers },
        { kind: 'maxProcessedRows', relation: 'users', max: scenario.maxUsers },
      ],
    })
    await runAndCapture(scenario.id, scenario.run)
  }
}
