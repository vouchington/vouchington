import { createElectionBatchGetter } from '../shared/entity-service.mts'
import { RSS_FEED_ITEM_ELECTION_CONFIG } from './config.mts'
import type { ViewRssFeedItemElection } from './types.mts'

export const getRssFeedItemElectionsByIdBatch = createElectionBatchGetter<ViewRssFeedItemElection>(
  RSS_FEED_ITEM_ELECTION_CONFIG,
)
