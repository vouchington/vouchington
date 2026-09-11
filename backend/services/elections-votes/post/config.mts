import type { EntityElectionConfig } from '../shared/types.mts'

export const POST_ELECTION_CONFIG: EntityElectionConfig = {
  entityTable: 'posts',
  voteTable: 'post_votes',
  entityIdColumn: 'post_id',
  entityType: 'post_election',
  deletedAtFilter: true,
  tracksOutboundActivityPubLike: true,
  tracksNeutralScore: true,
  tracksSemanticScore: true,
  legacySentimentEntityFilter: { field: 'post_type', excludedValues: ['topic_recommendation'] },
  votePolicy: 'sentiment',
  votePolicyByEntityField: {
    field: 'post_type',
    policies: { topic_recommendation: 'recommendation' },
  },
}
