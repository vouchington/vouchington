import { VOTE_SCHEMA_CONFIGS, type VoteSchemaConfig } from './election-schema-config.mts'
import { rebuildLegacySentimentTopicRatingMetricsSql } from './legacy-sentiment-topic-rating-metrics.mts'

const SENTIMENT_VOTE_CONFIGS = VOTE_SCHEMA_CONFIGS.filter(
  (config): config is VoteSchemaConfig & { entityTable: string; tracksSemanticScore: true } =>
    config.entityTable !== null && config.tracksSemanticScore === true,
)

export function generateLegacySentimentZeroVoteRepairSql(): string {
  return `CREATE TABLE IF NOT EXISTS election_vote_migration_claims (
  migration_id TEXT PRIMARY KEY,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (migration_id = TRIM(migration_id) AND char_length(migration_id) BETWEEN 1 AND 255)
);

COMMENT ON TABLE election_vote_migration_claims IS 'Durable claims that make one-shot election vote migrations converge without rescanning vote tables.';
COMMENT ON COLUMN election_vote_migration_claims.migration_id IS 'Stable identifier for the one-shot election vote migration that owns this claim.';
COMMENT ON COLUMN election_vote_migration_claims.claimed_at IS 'Time the migration claim was inserted; claim rows are immutable.';

${buildClaimedMigrationSql(
  'repair-legacy-sentiment-score-provenance',
  SENTIMENT_VOTE_CONFIGS.map(repairLegacySentimentScoreProvenanceSql),
)}
${buildClaimedMigrationSql('rebuild-legacy-sentiment-topic-rating-metrics', [
  rebuildLegacySentimentTopicRatingMetricsSql(),
])}`
}

/**
 * Reconciles ballots written by an old API during the production promotion window.
 * Unlike the one-shot migration above, callers own a separate durable claim and may retry.
 */
export function generateLegacySentimentFinalReconciliationSql(): string {
  return [
    ...SENTIMENT_VOTE_CONFIGS.map(repairLegacySentimentScoreProvenanceSql),
    rebuildLegacySentimentTopicRatingMetricsSql(),
  ].join('\n')
}

function buildClaimedMigrationSql(migrationId: string, statements: string[]): string {
  return `DO $$ BEGIN
  INSERT INTO election_vote_migration_claims (migration_id)
  VALUES ('${migrationId}')
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
${statements.join('\n')}
END $$;`
}

function repairLegacySentimentScoreProvenanceSql(config: VoteSchemaConfig): string {
  const entityFilter = legacySentimentEntityFilterSql(config, 'migration_entity')
  const outboundActivityPubLikeColumn = config.preservesOutboundActivityPubLike
    ? ', outbound_ap_like_activity_id'
    : ''
  const outboundActivityPubLikeSelect = config.preservesOutboundActivityPubLike
    ? ', CASE WHEN current_votes.score > 0 THEN current_votes.outbound_ap_like_activity_id ELSE NULL END'
    : ''
  const outboundActivityPubLikeCurrentVote = config.preservesOutboundActivityPubLike
    ? ', migration_vote.outbound_ap_like_activity_id'
    : ''
  return `  INSERT INTO ${config.voteTable} (id, user_id, ${config.entityIdColumn}, score, score_is_semantic${outboundActivityPubLikeColumn})
  SELECT uuidv7(uuid_extract_timestamp(current_votes.id) + INTERVAL '1 millisecond' - clock_timestamp()), current_votes.user_id, current_votes.${config.entityIdColumn},
    CASE current_votes.score WHEN 1 THEN 2 ELSE -2 END, FALSE${outboundActivityPubLikeSelect}
  FROM (
    SELECT DISTINCT ON (user_id, ${config.entityIdColumn})
      migration_vote.id, migration_vote.user_id, migration_vote.${config.entityIdColumn}, migration_vote.score, migration_vote.score_is_semantic${outboundActivityPubLikeCurrentVote}
    FROM ${config.voteTable} migration_vote
    ${legacySentimentEntityJoinSql(config, 'migration_entity')}
    WHERE ${entityFilter}
    ORDER BY migration_vote.user_id, migration_vote.${config.entityIdColumn}, migration_vote.id DESC
  ) current_votes
  WHERE current_votes.score IN (-1, 1) AND NOT current_votes.score_is_semantic;

  WITH legacy_entity_ids AS (
    SELECT DISTINCT migration_vote.${config.entityIdColumn} AS entity_id
    FROM ${config.voteTable} migration_vote
    ${legacySentimentEntityJoinSql(config, 'migration_entity')}
    WHERE (score = 0 AND NOT score_is_neutral AND ${entityFilter})
       OR (score IN (-1, 1) AND NOT score_is_semantic AND ${entityFilter})
  ), current_reconciled_votes AS (
    SELECT DISTINCT ON (current_vote.user_id, current_vote.${config.entityIdColumn})
      current_vote.${config.entityIdColumn} AS entity_id, current_vote.user_id, current_vote.score, current_vote.score_is_neutral, current_vote.score_is_semantic
    FROM ${config.voteTable} current_vote
    WHERE current_vote.${config.entityIdColumn} IN (SELECT entity_id FROM legacy_entity_ids)
    ORDER BY current_vote.user_id, current_vote.${config.entityIdColumn}, current_vote.id DESC
  ), aggregate_stats AS (
    SELECT
      legacy_entity_ids.entity_id,
      COALESCE(SUM(CASE WHEN current_reconciled_votes.score > 0 THEN (CASE WHEN current_reconciled_votes.score = 1 AND NOT current_reconciled_votes.score_is_semantic THEN 2 ELSE current_reconciled_votes.score END) * users.vote_weight ELSE 0 END), 0)::double precision AS votes_score_up,
      COALESCE(SUM(CASE WHEN current_reconciled_votes.score = 0 AND current_reconciled_votes.score_is_neutral THEN users.vote_weight ELSE 0 END), 0)::double precision AS votes_score_none,
      COALESCE(-SUM(CASE WHEN current_reconciled_votes.score < 0 THEN (CASE WHEN current_reconciled_votes.score = -1 AND NOT current_reconciled_votes.score_is_semantic THEN -2 ELSE current_reconciled_votes.score END) * users.vote_weight ELSE 0 END), 0)::double precision AS votes_score_down,
      COUNT(*) FILTER (WHERE current_reconciled_votes.score > 0 AND users.id IS NOT NULL)::integer AS votes_count_up,
      COUNT(*) FILTER (WHERE current_reconciled_votes.score = 0 AND current_reconciled_votes.score_is_neutral AND users.id IS NOT NULL)::integer AS votes_count_none,
      COUNT(*) FILTER (WHERE current_reconciled_votes.score < 0 AND users.id IS NOT NULL)::integer AS votes_count_down
    FROM legacy_entity_ids
    LEFT JOIN current_reconciled_votes ON current_reconciled_votes.entity_id = legacy_entity_ids.entity_id
    LEFT JOIN users ON users.id = current_reconciled_votes.user_id AND users.deleted_at IS NULL
    GROUP BY legacy_entity_ids.entity_id
  )
  UPDATE ${config.entityTable} entity
  SET
    votes_score_up = aggregate_stats.votes_score_up,
    votes_score_none = aggregate_stats.votes_score_none,
    votes_score_down = aggregate_stats.votes_score_down,
    votes_count_up = aggregate_stats.votes_count_up,
    votes_count_none = aggregate_stats.votes_count_none,
    votes_count_down = aggregate_stats.votes_count_down
  FROM aggregate_stats
  WHERE entity.id = aggregate_stats.entity_id
    AND (
      entity.votes_score_up IS DISTINCT FROM aggregate_stats.votes_score_up
      OR entity.votes_score_none IS DISTINCT FROM aggregate_stats.votes_score_none
      OR entity.votes_score_down IS DISTINCT FROM aggregate_stats.votes_score_down
      OR entity.votes_count_up IS DISTINCT FROM aggregate_stats.votes_count_up
      OR entity.votes_count_none IS DISTINCT FROM aggregate_stats.votes_count_none
      OR entity.votes_count_down IS DISTINCT FROM aggregate_stats.votes_count_down
    );`
}

function legacySentimentEntityJoinSql(config: VoteSchemaConfig, alias: string): string {
  if (!config.legacySentimentEntityFilter) return ''
  return `JOIN ${config.entityTable} ${alias} ON ${alias}.id = migration_vote.${config.entityIdColumn}`
}

function legacySentimentEntityFilterSql(config: VoteSchemaConfig, alias: string): string {
  const filter = config.legacySentimentEntityFilter
  if (!filter) return 'TRUE'
  const excludedValues = filter.excludedValues.map(value => `'${value}'`).join(', ')
  return `${alias}.${filter.field} NOT IN (${excludedValues})`
}
