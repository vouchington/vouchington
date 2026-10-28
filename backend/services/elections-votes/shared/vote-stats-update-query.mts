import { assertWhitelistedSqlIdentifier } from '@data-stores/psql'
import { ELECTION_ENTITY_TABLE_IDENTIFIERS } from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { AggregatedElectionStats, EntityElectionConfig } from './types.mts'

/** One entity row, with the canonical vote snapshot ordering predicate. */
export function buildElectionStatsUpdateQuery(
  config: EntityElectionConfig,
  entityId: string,
  stats: AggregatedElectionStats,
): SQLStatement {
  const entityTable = config.entityTable
  if (!entityTable) throw new Error('Election entity table is required')
  const table = assertWhitelistedSqlIdentifier(
    entityTable,
    ELECTION_ENTITY_TABLE_IDENTIFIERS,
    'entityTable',
  )
  const statement = sql`/* updateElectionStatsIfChanged */
  WITH current AS (
    SELECT id, votes_score_net AS prior_votes_score_net
    FROM `
  statement.append(table)
  statement.append(sql`
    WHERE id = ${entityId}`)

  if (config.deletedAtFilter) {
    statement.append(sql`
      AND deleted_at IS NULL`)
  }

  statement.append(sql`
    FOR UPDATE
  ), updated AS (
    UPDATE `)
  statement.append(table)
  statement.append(sql` AS entity
    SET
      votes_score_up   = ${stats.votes_score_up},
      votes_score_none = ${stats.votes_score_none},
      votes_score_down = ${stats.votes_score_down},
      votes_count_up   = ${stats.votes_count_up},
      votes_count_none = ${stats.votes_count_none},
      votes_count_down          = ${stats.votes_count_down},
      votes_snapshot_xmax       = ${stats.snapshot.xmax}::xid8,
      votes_snapshot_xip_count  = ${stats.snapshot.xipCount}
    FROM current
    WHERE entity.id = current.id
      -- A snapshot with a greater epoch-aware xmax is newer. At equal xmax no new transaction
      -- below that boundary can appear, so the in-progress set can only shrink.
      AND (
        entity.votes_snapshot_xmax IS NULL OR
        entity.votes_snapshot_xmax < ${stats.snapshot.xmax}::xid8 OR
        (
          entity.votes_snapshot_xmax = ${stats.snapshot.xmax}::xid8 AND
          entity.votes_snapshot_xip_count >= ${stats.snapshot.xipCount}
        )
      )
      AND (
        entity.votes_score_up   IS DISTINCT FROM ${stats.votes_score_up} OR
        entity.votes_score_none IS DISTINCT FROM ${stats.votes_score_none} OR
        entity.votes_score_down IS DISTINCT FROM ${stats.votes_score_down} OR
        entity.votes_count_up   IS DISTINCT FROM ${stats.votes_count_up} OR
        entity.votes_count_none IS DISTINCT FROM ${stats.votes_count_none} OR
        entity.votes_count_down          IS DISTINCT FROM ${stats.votes_count_down} OR
        entity.votes_snapshot_xmax       IS DISTINCT FROM ${stats.snapshot.xmax}::xid8 OR
        entity.votes_snapshot_xip_count  IS DISTINCT FROM ${stats.snapshot.xipCount}
      )
    RETURNING current.prior_votes_score_net
  ) SELECT * FROM updated
    `)
  return statement
}
