import { createVoteStatsUpdater } from '../shared/entity-service.mts'
import { RSS_FEED_ITEM_ELECTION_CONFIG } from './config.mts'
import { invalidate } from '@services/entity-cache'

export const updateRssFeedItemElectionVoteStats = createVoteStatsUpdater(
  RSS_FEED_ITEM_ELECTION_CONFIG,
  {
    invalidate: async (entityId: string) => {
      await Promise.all([
        invalidate.rss_feed_item_elections(entityId),
        invalidate.rss_feed_items(entityId),
      ])
    },
  },
)
