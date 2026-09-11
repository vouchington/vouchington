export type VoteSchemaConfig = {
  entityType: string
  entityTable: string | null // null for dynamic entity_relation tables
  voteTable: string
  entityIdColumn: string // the FK column name in the vote table (simple FK case)
  entityKeyColumns: string[] // PK/unique columns of entity used for FK reference
  entitySortColumns?: string[] // columns after votes_score_sort in sort index; defaults to entityKeyColumns
  voteAdditionalColumns?: string[] // extra columns on vote table (e.g. for composite FK)
  voteTableConstraints?: string[] // extra constraints (e.g. composite FK)
  voteScoreConstraint?: string // nullable score-domain CHECK
  tracksNeutralScore?: boolean // marks new sentiment score-zero ballots; old writers default to Clear
  tracksSemanticScore?: boolean // preserves semantic +/-1 intent; old writers default to Vouch/Disavow
  preservesOutboundActivityPubLike?: boolean // carries the current Like identity across semantic Vouch repair
  legacySentimentEntityFilter?: { field: string; excludedValues: string[] }
  deletedAtFilter?: boolean // when true, votes_score_sort indexes exclude deleted_at IS NOT NULL rows
}

export const VOTE_SCHEMA_CONFIGS: VoteSchemaConfig[] = [
  {
    entityType: 'post',
    entityTable: 'posts',
    voteTable: 'post_votes',
    entityIdColumn: 'post_id',
    entityKeyColumns: ['id'],
    entitySortColumns: ['id DESC'],
    voteAdditionalColumns: ['post_id UUID NOT NULL', 'outbound_ap_like_activity_id UUID'],
    voteTableConstraints: ['FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE'],
    deletedAtFilter: true,
    voteScoreConstraint: 'CHECK (score IS NULL OR score BETWEEN -2 AND 2)',
    tracksNeutralScore: true,
    tracksSemanticScore: true,
    preservesOutboundActivityPubLike: true,
    legacySentimentEntityFilter: { field: 'post_type', excludedValues: ['topic_recommendation'] },
  },
  {
    entityType: 'topic',
    entityTable: 'topics',
    voteTable: 'topic_votes',
    entityIdColumn: 'topic_id',
    entityKeyColumns: ['id'],
    entitySortColumns: ['id DESC'],
    deletedAtFilter: true,
    voteScoreConstraint: 'CHECK (score IS NULL OR score BETWEEN -2 AND 2)',
    tracksNeutralScore: true,
    tracksSemanticScore: true,
  },
  {
    entityType: 'hostname',
    entityTable: 'url_hostnames',
    voteTable: 'hostname_votes',
    entityIdColumn: 'hostname_id',
    entityKeyColumns: ['id'],
    voteScoreConstraint: 'CHECK (score IS NULL OR score BETWEEN -2 AND 2)',
    tracksNeutralScore: true,
    tracksSemanticScore: true,
  },
  {
    entityType: 'rss_feed_item',
    entityTable: 'rss_feed_items',
    voteTable: 'rss_feed_item_votes',
    entityIdColumn: 'rss_feed_item_id',
    entityKeyColumns: ['id'],
    entitySortColumns: ['id DESC'],
    deletedAtFilter: true,
    voteScoreConstraint: 'CHECK (score IS NULL OR score BETWEEN -2 AND 2)',
    tracksNeutralScore: true,
    tracksSemanticScore: true,
  },
  {
    entityType: 'agent_moderation',
    entityTable: 'agent_moderations',
    voteTable: 'agent_moderation_votes',
    entityIdColumn: 'agent_moderation_id',
    entityKeyColumns: ['post_id', 'id'],
    entitySortColumns: ['post_id', 'id'],
    voteAdditionalColumns: ['post_id UUID NOT NULL', 'agent_moderation_id UUID NOT NULL'],
    voteTableConstraints: [
      'FOREIGN KEY (post_id, agent_moderation_id) REFERENCES agent_moderations (post_id, id) ON DELETE CASCADE',
    ],
    deletedAtFilter: true,
    // Historic Neutral rows remain immutable audit events. Public mutation validation prevents
    // new Neutral ballots for this binary policy, while current reads treat an old 0 as no ballot.
    voteScoreConstraint: 'CHECK (score IS NULL OR score IN (-1, 0, 1))',
  },
  {
    entityType: 'user_vouch',
    entityTable: 'users',
    voteTable: 'user_vouch_votes',
    entityIdColumn: 'target_user_id',
    entityKeyColumns: ['id'],
    deletedAtFilter: true,
    voteScoreConstraint: 'CHECK (score IS NULL OR score BETWEEN -2 AND 2)',
    tracksNeutralScore: true,
    tracksSemanticScore: true,
  },
]
