import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import { listLiveItemSourceFeedsPage } from '@services/post-publication/live-topic-merge-pages'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import {
  getRssFeedItemRelationRows,
  getRssFeedRelationRows,
} from '@services/users/profile-collection-ids'
import {
  RSS_FEED_ITEM_LIST_TABLES,
  RSS_FEED_LIST_TABLES,
} from '@services/users/profile-collection-tables'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  deleteFollowedFeedPage,
  deleteSavedRssItems,
  deleteSourceFeedPage,
  seedFollowedFeedPage,
  seedSavedRssItems,
  seedSourceFeedPage,
} from './deleted-parent-page-seeds.mts'

const PAGE_SIZE = 26
const followExpectations = [
  {
    kind: 'usesIndexes' as const,
    indexes: ['idx_relation__user__follow__rss_feed__subject__newest'],
    noSort: true,
  },
  { kind: 'maxProcessedRows' as const, relation: 'relation__user__follow__rss_feed', max: 80 },
  { kind: 'maxProcessedRows' as const, relation: 'rss_feeds', max: 80 },
]

export async function runRssDeletedParentPageScenarios(): Promise<void> {
  const followedFeedIds = await seedFollowedFeedPage()
  try {
    const firstFollowedPage = await getRssFeedRelationRows(
      RSS_FEED_LIST_TABLES.following,
      seedUser.id,
      PAGE_SIZE,
      {},
    )
    assert.equal(firstFollowedPage.length, PAGE_SIZE)
    const laterCursor = {
      timestamp: firstFollowedPage.at(-1)!.created_us,
      id: firstFollowedPage.at(-1)!.object_id,
    }
    assert.equal(
      (
        await getRssFeedRelationRows(
          RSS_FEED_LIST_TABLES.following,
          seedUser.id,
          PAGE_SIZE,
          {},
          { after: laterCursor },
        )
      ).length,
      PAGE_SIZE,
    )
    registerScenarioContract('deleted-parent-followed-feeds', {
      expectations: followExpectations,
    })
    await runAndCapture(
      'deleted-parent-followed-feeds',
      () => getRssFeedRelationRows(RSS_FEED_LIST_TABLES.following, seedUser.id, PAGE_SIZE, {}),
      undefined,
      'getRssFeedRelationRows',
    )
    registerScenarioContract('deleted-parent-followed-feeds-cursor', {
      expectations: followExpectations,
    })
    await runAndCapture(
      'deleted-parent-followed-feeds-cursor',
      () =>
        getRssFeedRelationRows(
          RSS_FEED_LIST_TABLES.following,
          seedUser.id,
          PAGE_SIZE,
          {},
          {
            after: laterCursor,
          },
        ),
      undefined,
      'getRssFeedRelationRows',
    )
  } finally {
    await deleteFollowedFeedPage(followedFeedIds)
  }

  const savedItemIds = await seedSavedRssItems()
  try {
    registerScenarioContract('deleted-parent-saved-items', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_relation__user__save__rss_feed_item__subject__newest'],
        },
        { kind: 'maxProcessedRows', relation: 'relation__user__save__rss_feed_item', max: 80 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 80 },
      ],
    })
    await runAndCapture(
      'deleted-parent-saved-items',
      () => getRssFeedItemRelationRows(RSS_FEED_ITEM_LIST_TABLES.saved, seedUser.id, PAGE_SIZE, {}),
      undefined,
      'getRssFeedItemRelationRows',
    )
  } finally {
    await deleteSavedRssItems(savedItemIds)
  }

  const { rows: sourceItems } = await read<{ id: string }>(
    `/* explainDeletedParentSourceItem */ SELECT rss_feed_item_id AS id
     FROM rss_feed_item_sources ORDER BY rss_feed_item_id LIMIT 1`,
  )
  const sourceItemId = sourceItems[0]?.id
  assert.ok(sourceItemId, 'Source-feed page requires a seeded item source')
  const sourceFeedIds = await seedSourceFeedPage(sourceItemId)
  try {
    const sourcePageRows = Math.ceil((getPostPublicationWorkLimit('capture_batch_size') + 1) * 1.2)
    registerScenarioContract('deleted-parent-source-feeds', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_rss_feed_item_sources__item_feed', 'rss_feeds_pkey'],
          noSort: true,
        },
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: sourcePageRows },
        { kind: 'maxProcessedRows', relation: 'rss_feeds', max: sourcePageRows },
      ],
    })
    await runAndCapture(
      'deleted-parent-source-feeds',
      async () => {
        const page = await listLiveItemSourceFeedsPage(sourceItemId, null)
        assert.equal(page.ids.length, getPostPublicationWorkLimit('capture_batch_size'))
        assert.ok(page.cursor)
        return page
      },
      undefined,
      'listLiveItemSourceFeedsPage',
    )
  } finally {
    await deleteSourceFeedPage(sourceItemId, sourceFeedIds)
  }
}
