import { assertWhitelistedSqlIdentifier, read, write } from '@data-stores/psql'
import {
  ELECTION_ENTITY_TABLE_IDENTIFIERS,
  VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
  VOTE_TABLE_IDENTIFIERS,
} from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { AggregatedElectionStats, EntityElectionConfig } from './types.mts'

/**
 * Aggregates vote stats from replica for a specific entity.
 * Uses DISTINCT ON to resolve the current (latest) vote per user from the append-only table.
 *
 * Used by entity-specific services to calculate updated vote counts and scores from current votes.
 *
 * Intentionally reads the replica, not the primary: this recompute is a full idempotent
 * overwrite of an absolute value from an append-only vote table, run asynchronously with
 * throttle dedup and delayed through the throttle window plus a replica-lag safety margin
 * (`ELECTIONS_DEFAULTS.recomputeDelayMs`; see `backend/queues/elections/config.mts` and
 * `enqueues.mts`). A stale read under residual lag does NOT self-correct when the missed vote is
 * the last one in a throttle burst, since no later vote-triggered recompute follows it — there is
 * currently no reconciler for this case (#11113). See #7352 for the replica-read rationale.
 */
export async function aggregateElectionVoteStatsFromReplica(
  config: EntityElectionConfig,
  entityId: string,
  relationTable?: string,
): Promise<AggregatedElectionStats> {
  const { rows } = await read(buildAggregateElectionVoteStatsQuery(config, entityId, relationTable))
  return getAggregatedElectionStats(rows)
}

export async function aggregateElectionVoteStatsFromPrimary(
  config: EntityElectionConfig,
  entityId: string,
  relationTable?: string,
): Promise<AggregatedElectionStats> {
  const { rows } = await write(
    buildAggregateElectionVoteStatsQuery(config, entityId, relationTable),
  )
  return getAggregatedElectionStats(rows)
}

function buildAggregateElectionVoteStatsQuery(
  config: EntityElectionConfig,
  entityId: string,
  relationTable?: string,
) {
  const query = sql`/* aggregateElectionVoteStats */
    WITH captured_snapshot AS MATERIALIZED (
      SELECT pg_current_snapshot() AS value
    ), snapshot_marker AS (
      SELECT
        pg_snapshot_xmax(value) AS xmax,
        (SELECT COUNT(*)::integer FROM pg_snapshot_xip(value)) AS xip_count
      FROM captured_snapshot
    ), current_votes AS (
      SELECT DISTINCT ON (election_vote.user_id) election_vote.user_id, election_vote.id, election_vote.score, `

  query.append(config.tracksNeutralScore ? sql`election_vote.score_is_neutral` : sql`FALSE`)
  query.append(sql` AS score_is_neutral
      , `)
  query.append(config.tracksSemanticScore ? sql`election_vote.score_is_semantic` : sql`FALSE`)
  query.append(sql` AS score_is_semantic
      , `)
  appendLegacySentimentPolicyField(config, query)
  query.append(sql`
      FROM `)

  query.append(
    assertWhitelistedSqlIdentifier(config.voteTable, VOTE_TABLE_IDENTIFIERS, 'voteTable'),
  )
  query.append(sql` AS election_vote`)
  appendLegacySentimentPolicyJoin(config, query)
  query.append(sql`
      WHERE `)
  query.append(
    assertWhitelistedSqlIdentifier(
      config.entityIdColumn,
      VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
      'entityIdColumn',
    ),
  )
  query.append(sql` = ${entityId}
  `)
  if (relationTable)
    query.append(sql`      AND relation_table = ${relationTable}
  `)
  query.append(sql`      ORDER BY election_vote.user_id, election_vote.id DESC
    ), aggregated_stats AS (
    SELECT
      COALESCE(SUM(CASE WHEN cv.score > 0 THEN (CASE WHEN cv.score = 1 AND NOT cv.score_is_semantic AND cv.is_sentiment_policy THEN 2 ELSE cv.score END) * u.vote_weight ELSE 0 END), 0)::double precision AS votes_score_up,
      COALESCE(SUM(CASE WHEN cv.score = 0 AND cv.score_is_neutral THEN u.vote_weight ELSE 0 END), 0)::double precision AS votes_score_none,
      COALESCE(-SUM(CASE WHEN cv.score < 0 THEN (CASE WHEN cv.score = -1 AND NOT cv.score_is_semantic AND cv.is_sentiment_policy THEN -2 ELSE cv.score END) * u.vote_weight ELSE 0 END), 0)::double precision AS votes_score_down,
      COUNT(*) FILTER (WHERE cv.score > 0)::integer AS votes_count_up,
      COUNT(*) FILTER (WHERE cv.score = 0 AND cv.score_is_neutral)::integer AS votes_count_none,
      COUNT(*) FILTER (WHERE cv.score < 0)::integer AS votes_count_down
    FROM current_votes cv
    JOIN users u ON u.id = cv.user_id AND u.deleted_at IS NULL
    WHERE cv.score IS NOT NULL
    )
    SELECT
      aggregated_stats.*,
      snapshot_marker.xmax AS votes_snapshot_xmax,
      snapshot_marker.xip_count AS votes_snapshot_xip_count
    FROM aggregated_stats
    CROSS JOIN snapshot_marker
  `)
  return query
}

function appendLegacySentimentPolicyField(config: EntityElectionConfig, query: SQLStatement): void {
  if (config.votePolicy !== 'sentiment') {
    query.append(sql`FALSE AS is_sentiment_policy`)
    return
  }
  const filter = config.legacySentimentEntityFilter
  if (!filter) {
    query.append(sql`TRUE AS is_sentiment_policy`)
    return
  }
  if (!config.entityTable)
    throw new Error(
      `Legacy sentiment policy filter requires an entity table for ${config.voteTable}`,
    )
  query.append(sql`CASE WHEN election_entity.`)
  query.append(filter.field)
  query.append(
    sql`::text = ANY(${filter.excludedValues}::text[]) THEN FALSE ELSE TRUE END AS is_sentiment_policy`,
  )
}

function appendLegacySentimentPolicyJoin(config: EntityElectionConfig, query: SQLStatement): void {
  if (!config.legacySentimentEntityFilter) return
  if (!config.entityTable)
    throw new Error(
      `Legacy sentiment policy filter requires an entity table for ${config.voteTable}`,
    )
  query.append(sql` JOIN `)
  query.append(
    assertWhitelistedSqlIdentifier(
      config.entityTable,
      ELECTION_ENTITY_TABLE_IDENTIFIERS,
      'entityTable',
    ),
  )
  query.append(sql` AS election_entity ON election_entity.id = election_vote.`)
  query.append(config.entityIdColumn)
}

type AggregatedElectionStatsRow = Omit<AggregatedElectionStats, 'snapshot'> & {
  votes_snapshot_xmax: string
  votes_snapshot_xip_count: number
}

function getAggregatedElectionStats(rows: Record<string, unknown>[]): AggregatedElectionStats {
  const row = rows[0] as AggregatedElectionStatsRow | undefined
  if (!row) throw new Error('Vote aggregation must return exactly one row')
  return {
    votes_score_up: row.votes_score_up,
    votes_score_none: row.votes_score_none,
    votes_score_down: row.votes_score_down,
    votes_count_up: row.votes_count_up,
    votes_count_none: row.votes_count_none,
    votes_count_down: row.votes_count_down,
    snapshot: {
      xmax: row.votes_snapshot_xmax,
      xipCount: row.votes_snapshot_xip_count,
    },
  }
}

/**
 * Updates entity vote stats if any values have changed.
 *
 * Uses IS DISTINCT FROM to handle null comparisons and only
 * updates rows when at least one value is different.
 * Skips if entityTable is null (entity_relation case — handled separately).
 */
export { updateElectionStatsIfChanged } from './vote-stats-update.mts'
