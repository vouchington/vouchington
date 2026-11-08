import { beginTransaction } from '@data-stores/psql'
import {
  assertCommunityMembershipCapacity,
  assertCommunityModeratorCapacity,
} from '@services/communities/membership-limits'
import {
  getCachedCommunityModerators,
  getCachedUserMemberships,
  invalidateCommunityMembershipCaches,
} from '@services/entity-cache/community-memberships'
import { isUserCommunityModerator } from '@services/user-mod-notes/authorization'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES,
  COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID,
  COMMUNITY_MEMBERSHIP_CAP_MODERATORS,
  COMMUNITY_MEMBERSHIP_CAP_USER_ID,
} from '../seed-data/community-membership-caps.mts'

const moderator = { ...seedUser, id: COMMUNITY_MEMBERSHIP_CAP_USER_ID }

export async function runCommunityMembershipCapScenarios(): Promise<void> {
  registerScenarioContract('community-membership-capacity', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_members__user_id_desc', 'idx_community_members__user_id_id'],
        anyOf: true,
      },
      { kind: 'usesIndexes', indexes: ['communities_pkey'] },
      // 1,000 memberships plus the existing-membership probe, with 20% headroom.
      { kind: 'maxProcessedRows', relation: 'community_members', max: 1202 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 1200 },
    ],
  })
  await runAndCapture(
    'community-membership-capacity',
    async () => {
      await using transaction = await beginTransaction()
      await assertCommunityMembershipCapacity(
        COMMUNITY_MEMBERSHIP_CAP_USER_ID,
        COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID,
        { query: transaction },
      )
      await transaction.rollback()
    },
    undefined,
    'assertCommunityMembershipCapacity',
    {
      exactCapturedNames: [
        'assertCommunityMembershipCapacity:lock',
        'assertCommunityMembershipCapacity',
      ],
    },
  )

  registerScenarioContract('community-moderator-capacity', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_community_members__active_moderators',
          'idx_community_members__active_moderator_user_id',
        ],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 120 },
    ],
  })
  await runAndCapture(
    'community-moderator-capacity',
    async () => {
      await using transaction = await beginTransaction()
      await assertCommunityModeratorCapacity(COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID, {
        query: transaction,
      }).then(
        () => {
          throw new Error('The seeded community must be at moderator capacity')
        },
        (err: unknown) => {
          if ((err as { status?: number }).status !== 409) throw err
        },
      )
      await transaction.rollback()
    },
    undefined,
    'assertCommunityModeratorCapacity',
    { exactCapturedNames: ['assertCommunityModeratorCapacity'] },
  )

  registerScenarioContract('community-membership-cache-user-miss', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_members__user_id_desc', 'idx_community_members__user_id_id'],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 1200 },
    ],
  })
  await invalidateCommunityMembershipCaches([COMMUNITY_MEMBERSHIP_CAP_USER_ID], [])
  await runAndCapture(
    'community-membership-cache-user-miss',
    async () => {
      const memberships = await getCachedUserMemberships(COMMUNITY_MEMBERSHIP_CAP_USER_ID)
      if (memberships?.length !== COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES)
        throw new Error('User cache miss must return all 1,000 seeded memberships')
    },
    undefined,
    'membershipCache:user',
    { exactCapturedNames: ['membershipCache:user'] },
  )

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
        indexes: [
          'idx_community_members__active_moderators',
          'idx_community_members__active_moderator_user_id',
        ],
        anyOf: true,
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
