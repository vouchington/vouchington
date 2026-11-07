import type { TransactionQuery } from '@data-stores/psql/types'
import type { DistributionRow, ProcessTargetRowsResult } from './process-types.mts'
import { insertPostFeedShares, insertPostManualSendNotifications } from './post-target-rows.mts'
import {
  insertRssFeedItemFeedShares,
  insertRssFeedItemManualSendNotifications,
} from './rss-feed-item-target-rows.mts'

export async function processTargetRows(
  distribution: DistributionRow,
  recipientIds: string[],
  query: TransactionQuery,
): Promise<ProcessTargetRowsResult> {
  switch (distribution.action) {
    case 'post_share':
      return emptyTargetRowsResult(await insertPostFeedShares(distribution, recipientIds, query))
    case 'post_send':
      return insertPostManualSendNotifications(distribution, recipientIds, query)
    case 'rss_feed_item_share':
      return emptyTargetRowsResult(
        await insertRssFeedItemFeedShares(distribution, recipientIds, query),
      )
    case 'rss_feed_item_send':
      return insertRssFeedItemManualSendNotifications(distribution, recipientIds, query)
  }
}

function emptyTargetRowsResult(succeeded: boolean): ProcessTargetRowsResult {
  return { failed: !succeeded, notificationsToDeliver: [] }
}
