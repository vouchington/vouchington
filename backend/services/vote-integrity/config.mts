// Velocity spike detection thresholds
export const VELOCITY_SPIKE_THRESHOLD = 20
export const VELOCITY_SPIKE_WINDOW_MINUTES = 5

// Account age for "young" accounts
export const YOUNG_ACCOUNT_AGE_DAYS = 30

// IP correlation thresholds
export const IP_CORRELATION_THRESHOLD = 3
export const IP_CORRELATION_WINDOW_MINUTES = 60

// Default penalty multiplier for voting rings
export const DEFAULT_PENALTY_MULTIPLIER = 0.2

export {
  INTEGRITY_FLAG_STATUSES,
  VOTE_INTEGRITY_FLAG_TYPES,
  VOTE_INTEGRITY_RESOLUTIONS,
  type IntegrityFlagStatus,
  type VoteIntegrityResolution,
} from '@ts-shared/utils/moderation-catalogs'

// Mapping from entity type string to its vote table and entity ID column.
// Used by detection services to query the correct vote table directly.
export type EntityVoteTableConfig = {
  voteTable: string
  entityIdColumn: string
}

export const ENTITY_VOTE_TABLES: Record<string, EntityVoteTableConfig> = {
  post: { voteTable: 'post_votes', entityIdColumn: 'post_id' },
  topic: { voteTable: 'topic_votes', entityIdColumn: 'topic_id' },
  hostname: { voteTable: 'hostname_votes', entityIdColumn: 'hostname_id' },
  rss_feed_item: { voteTable: 'rss_feed_item_votes', entityIdColumn: 'rss_feed_item_id' },
  entity_relation: { voteTable: 'entity_relation_votes', entityIdColumn: 'entity_relation_id' },
  agent_moderation: {
    voteTable: 'agent_moderation_votes',
    entityIdColumn: 'agent_moderation_id',
  },
}

// Mapping from entity type string to its FK column in vote_integrity_flags.
export const ENTITY_TYPE_TO_FLAG_FK: Record<string, string> = {
  post: 'post_id',
  topic: 'topic_id',
  hostname: 'hostname_id',
  rss_feed_item: 'rss_feed_item_id',
}

// All FK column names in vote_integrity_flags (in order).
export const FLAG_ENTITY_FK_COLUMNS = [
  'post_id',
  'topic_id',
  'hostname_id',
  'rss_feed_item_id',
  'entity_relation_id',
  'agent_moderation_id',
] as const
