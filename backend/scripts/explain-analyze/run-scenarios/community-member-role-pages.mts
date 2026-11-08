import { searchCommunityMembers } from '@services/communities/members/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID } from '../seed-data/community-membership-caps.mts'

/**
 * Role pages on the 10k-member community must not read its regular members.
 * That community has one owner and 99 moderators. A generic plan may use the
 * staff partial indexes and read that whole staff cohort before LIMIT.
 */
export async function runCommunityMemberRolePageScenarios(): Promise<void> {
  const communityId = COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID
  const boundedRoleIndexes = [
    'idx_community_members__active_community_role_id',
    'idx_community_members__active_moderators',
    'idx_community_members__moderator_community_id',
  ]
  const scenarios = [
    {
      id: 'search-community-members-owner-role',
      maxMembers: 160,
      run: () => searchCommunityMembers(communityId, { limit: 25, role: 'owner' }),
    },
    {
      id: 'search-community-members-moderator-role',
      maxMembers: 160,
      run: () => searchCommunityMembers(communityId, { limit: 25, role: 'moderator' }),
    },
    {
      id: 'search-community-members-moderator-roster',
      maxMembers: 240,
      run: () => searchCommunityMembers(communityId, { limit: 25, rosterVisibility: 'moderators' }),
    },
  ] as const
  for (const scenario of scenarios) {
    registerScenarioContract(scenario.id, {
      expectations: [
        { kind: 'usesIndexes', indexes: boundedRoleIndexes, anyOf: true },
        { kind: 'maxProcessedRows', relation: 'community_members', max: scenario.maxMembers },
        { kind: 'maxProcessedRows', relation: 'users', max: 80 },
      ],
    })
    await runAndCapture(scenario.id, scenario.run)
  }
}
