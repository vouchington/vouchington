import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { searchCommunityMembers } from '@services/communities/members/get'
import { listUserMemberCommunities } from '@services/communities/members/member-communities'
import { getNextRecipientBatch } from '@services/follower-distributions/process-state'
import type { DistributionRow } from '@services/follower-distributions/process-types'
import type { PrivateUser } from '@services/users/types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId, seedUser } from '../run-support.mts'
import {
  COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID,
  COMMUNITY_MEMBERSHIP_CAP_USER_ID,
} from '../seed-data/community-membership-caps.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runModerationVersionPageScenarios } from './moderation-version-pages.mts'
import { runCommunityMemberRolePageScenarios } from './community-member-role-pages.mts'
import { runCommunityEligiblePageScenarios } from './community-eligible-pages.mts'
import { runRssDeletedParentPageScenarios } from './deleted-parent-rss-pages.mts'
import {
  deleteSelectedRecipients,
  seedSelectedRecipients,
  SELECTED_DISTRIBUTION_ID,
} from './deleted-parent-page-seeds.mts'

export async function runDeletedParentPageScenarios(): Promise<void> {
  registerScenarioContract('deleted-parent-community-members', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_members__active_community_id_id', 'community_members_pkey'],
        anyOf: true,
      },
      // Custom plans inspected 1,053 memberships plus 26 hydrations after fixture churn;
      // generic plans used the covering membership index for 26 eligible ids.
      { kind: 'maxProcessedRows', relation: 'community_members', max: 1500 },
      { kind: 'maxProcessedRows', relation: 'users', max: 80 },
    ],
  })
  await runAndCapture('deleted-parent-community-members', () =>
    searchCommunityMembers(COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID, { limit: 25 }),
  )
  await runCommunityMemberRolePageScenarios()
  await runCommunityEligiblePageScenarios()
  await runRssDeletedParentPageScenarios()

  const memberViewer = { id: COMMUNITY_MEMBERSHIP_CAP_USER_ID } as PrivateUser
  registerScenarioContract('deleted-parent-member-communities', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_members__user_id_desc', 'idx_community_members__user_id_id'],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 80 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 80 },
      { kind: 'maxProcessedRows', relation: 'users', max: 32 },
    ],
  })
  await runAndCapture('deleted-parent-member-communities', () =>
    listUserMemberCommunities(COMMUNITY_MEMBERSHIP_CAP_USER_ID, memberViewer, { limit: 25 }),
  )

  await seedSelectedRecipients()
  registerScenarioContract('deleted-parent-selected-recipients', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'follower_distribution_selected_recipients', max: 80 },
      { kind: 'maxProcessedRows', relation: 'users', max: 110 },
    ],
  })
  try {
    await runAndCapture(
      'deleted-parent-selected-recipients',
      async () => {
        await using query = await beginTransaction()
        const page = await getNextRecipientBatch(selectedDistribution(), 21, query)
        assert.equal(page.ids.length, 21)
        assert.equal(page.hasMore, true)
        await query.rollback()
      },
      undefined,
      'getNextRecipientBatch:selected',
    )
    registerScenarioContract('deleted-parent-selected-recipients-cursor', {
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'follower_distribution_selected_recipients',
          max: 50,
        },
        { kind: 'maxProcessedRows', relation: 'users', max: 70 },
      ],
    })
    await runAndCapture(
      'deleted-parent-selected-recipients-cursor',
      async () => {
        await using query = await beginTransaction()
        const page = await getNextRecipientBatch(
          selectedDistribution(seedUuid(62, 'cf')),
          21,
          query,
        )
        assert.equal(page.ids.length, 12)
        assert.equal(page.hasMore, false)
        await query.rollback()
      },
      undefined,
      'getNextRecipientBatch:selected',
    )
  } finally {
    await deleteSelectedRecipients()
  }

  await runModerationVersionPageScenarios()
}

function selectedDistribution(after: string | null = null): DistributionRow {
  return {
    id: SELECTED_DISTRIBUTION_ID,
    sender_user_id: seedUser.id,
    sender_username: seedUser.username ?? null,
    action: 'post_send',
    audience: 'selected_followers',
    post_id: seedPostId,
    rss_feed_item_id: null,
    cursor_recipient_id: after,
    completed_at: null,
    failed_at: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  }
}
