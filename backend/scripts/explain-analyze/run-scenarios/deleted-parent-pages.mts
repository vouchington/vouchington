import assert from 'node:assert/strict'
import { beginTransaction, read } from '@data-stores/psql'
import { searchCommunityMembers } from '@services/communities/members/get'
import { listUserMemberCommunities } from '@services/communities/members/member-communities'
import { getNextRecipientBatch } from '@services/follower-distributions/process-state'
import type { DistributionRow } from '@services/follower-distributions/process-types'
import { reconcilePostModerationWork } from '@services/post-clearance'
import { listLiveItemSourceFeedsPage } from '@services/post-publication/live-topic-merge-pages'
import type { PrivateUser } from '@services/users/types'
import {
  getRssFeedItemRelationRows,
  getRssFeedRelationRows,
} from '@services/users/profile-collection-ids'
import {
  RSS_FEED_ITEM_LIST_TABLES,
  RSS_FEED_LIST_TABLES,
} from '@services/users/profile-collection-tables'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId, seedUser } from '../run-support.mts'
import {
  COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID,
  COMMUNITY_MEMBERSHIP_CAP_USER_ID,
} from '../seed-data/community-membership-caps.mts'
import { runCommunityMemberRolePageScenarios } from './community-member-role-pages.mts'
import {
  DELETED_PARENT_MODERATION_POST_ID,
  deleteDeletedParentModerationVersion,
  deleteSavedRssItems,
  deleteSelectedRecipients,
  seedDeletedParentModerationVersion,
  seedSavedRssItems,
  seedSelectedRecipients,
  SELECTED_DISTRIBUTION_ID,
} from './deleted-parent-page-seeds.mts'

export async function runDeletedParentPageScenarios(): Promise<void> {
  registerScenarioContract('deleted-parent-community-members', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_community_members__active_community_id_id'] },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 80 },
      { kind: 'maxProcessedRows', relation: 'users', max: 80 },
    ],
  })
  await runAndCapture('deleted-parent-community-members', () =>
    searchCommunityMembers(COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID, { limit: 25 }),
  )
  await runCommunityMemberRolePageScenarios()

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
      { kind: 'maxProcessedRows', relation: 'users', max: 10 },
    ],
  })
  await runAndCapture('deleted-parent-member-communities', () =>
    listUserMemberCommunities(COMMUNITY_MEMBERSHIP_CAP_USER_ID, memberViewer, { limit: 25 }),
  )

  registerScenarioContract('deleted-parent-followed-feeds', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__user__follow__rss_feed', max: 80 },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 80 },
    ],
  })
  await runAndCapture(
    'deleted-parent-followed-feeds',
    () => getRssFeedRelationRows(RSS_FEED_LIST_TABLES.following, seedUser.id, 26, {}),
    undefined,
    'getRssFeedRelationRows',
  )

  registerScenarioContract('deleted-parent-saved-items', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__user__save__rss_feed_item', max: 80 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 80 },
    ],
  })
  await seedSavedRssItems()
  try {
    await runAndCapture(
      'deleted-parent-saved-items',
      () => getRssFeedItemRelationRows(RSS_FEED_ITEM_LIST_TABLES.saved, seedUser.id, 26, {}),
      undefined,
      'getRssFeedItemRelationRows',
    )
  } finally {
    await deleteSavedRssItems()
  }

  const { rows: sourceItems } = await read<{ id: string }>(
    `/* explainDeletedParentSourceItem */ SELECT rss_feed_item_id AS id
     FROM rss_feed_item_sources ORDER BY rss_feed_item_id LIMIT 1`,
  )
  const sourceItemId = sourceItems[0]?.id
  assert.ok(sourceItemId, 'Source-feed page requires a seeded item source')
  registerScenarioContract('deleted-parent-source-feeds', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 700 },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 700 },
    ],
  })
  await runAndCapture(
    'deleted-parent-source-feeds',
    () => listLiveItemSourceFeedsPage(sourceItemId, null),
    undefined,
    'listLiveItemSourceFeedsPage',
  )

  await seedSelectedRecipients()
  registerScenarioContract('deleted-parent-selected-recipients', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'follower_distribution_selected_recipients', max: 40 },
      { kind: 'maxProcessedRows', relation: 'users', max: 40 },
    ],
  })
  try {
    await runAndCapture(
      'deleted-parent-selected-recipients',
      async () => {
        await using query = await beginTransaction()
        await getNextRecipientBatch(selectedDistribution(), 21, query)
        await query.rollback()
      },
      undefined,
      'getNextRecipientBatch:selected',
    )
  } finally {
    await deleteSelectedRecipients()
  }

  await seedDeletedParentModerationVersion()
  try {
    registerScenarioContract('deleted-parent-moderation-versions', {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_post_moderation_versions__post_id__id'] },
        { kind: 'maxProcessedRows', relation: 'post_moderation_versions', max: 20 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 10 },
      ],
    })
    await runAndCapture(
      'deleted-parent-moderation-versions',
      () => reconcilePostModerationWork(10, [DELETED_PARENT_MODERATION_POST_ID]),
      undefined,
      'reconcilePostModerationWork',
    )
  } finally {
    await deleteDeletedParentModerationVersion()
  }
}

function selectedDistribution(): DistributionRow {
  return {
    id: SELECTED_DISTRIBUTION_ID,
    sender_user_id: seedUser.id,
    sender_username: seedUser.username ?? null,
    action: 'post_send',
    audience: 'selected_followers',
    post_id: seedPostId,
    rss_feed_item_id: null,
    cursor_recipient_id: null,
    completed_at: null,
    failed_at: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  }
}
