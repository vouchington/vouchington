import {
  getCachedCommunityModerators,
  invalidateCommunityMembershipCaches,
} from '@services/entity-cache/community-memberships'
import { isUserCommunityModerator } from '@services/user-mod-notes/authorization'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID,
  COMMUNITY_MEMBERSHIP_CAP_MODERATORS,
  COMMUNITY_MEMBERSHIP_CAP_USER_ID,
} from '../seed-data/community-membership-caps.mts'

const moderator = { ...seedUser, id: COMMUNITY_MEMBERSHIP_CAP_USER_ID }

export async function runCommunityMembershipCapScenarios(): Promise<void> {
  registerScenarioContract('community-membership-auth-target', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_community_members__unique', 'communities_pkey'] },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 2 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 2 },
    ],
  })
  await runAndCapture(
    'community-membership-auth-target',
    async () => {
      const allowed = await isUserCommunityModerator(
        moderator,
        COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID,
      )
      if (!allowed) throw new Error('The cap seed user must moderate the target community')
    },
    undefined,
    'isUserCommunityModerator',
    { exactCapturedNames: ['isUserCommunityModerator'] },
  )

  registerScenarioContract('community-membership-cache-moderator-miss', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_members__active_moderators'],
      },
      // The target community has 100 moderators, including its owner; the plan budget adds 20%.
      { kind: 'maxProcessedRows', relation: 'community_members', max: 120 },
    ],
  })
  await invalidateCommunityMembershipCaches([], [COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID])
  await runAndCapture(
    'community-membership-cache-moderator-miss',
    async () => {
      const moderatorIds = await getCachedCommunityModerators(COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID)
      if (
        moderatorIds.length !== COMMUNITY_MEMBERSHIP_CAP_MODERATORS ||
        !moderatorIds.includes(COMMUNITY_MEMBERSHIP_CAP_USER_ID)
      ) {
        throw new Error(
          'Moderator cache miss must return all 100 seeded moderators, including the owner',
        )
      }
    },
    undefined,
    'membershipCache:moderators',
    { exactCapturedNames: ['membershipCache:moderators'] },
  )
}
