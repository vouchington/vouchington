import type { EntityElectionConfig } from '../shared/types.mts'

export const RSS_FEED_ITEM_ELECTION_CONFIG: EntityElectionConfig = {
  entityTable: 'rss_feed_items',
  voteTable: 'rss_feed_item_votes',
  entityIdColumn: 'rss_feed_item_id',
  entityType: 'rss_feed_item_election',
  deletedAtFilter: true,
  tracksNeutralScore: true,
  tracksSemanticScore: true,
  votePolicy: 'sentiment',
}
