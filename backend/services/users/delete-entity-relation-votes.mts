import { assertWhitelistedSqlIdentifier } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import {
  isPostPublicationRelationTable,
  recordPostTopicRelationPublicationChanges,
} from '@services/entity-relations'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import sql from 'sql-template-strings'

const electionTables = new Set(
  entityRelationMetadatum.flatMap(metadata => (metadata.election ? [metadata.table_name] : [])),
)

export type EntityRelationVoteTarget = { relationTable: string; entityRelationId: string }
export type UpdatedEntityRelationVoteStats = {
  relation_table: string
  subject_id: string
  object_id: string
  prior_votes_score_net: number
  next_votes_score_net: number
}

export async function recomputeEntityRelationVoteStats(
  targets: EntityRelationVoteTarget[],
  query: TransactionQuery,
): Promise<UpdatedEntityRelationVoteStats[]> {
  const statement = sql`/* recomputeEntityRelationVoteStatsAfterUserDeletion */
    WITH affected_ids AS (
      SELECT * FROM UNNEST(
        ${targets.map(target => target.relationTable)}::text[],
        ${targets.map(target => target.entityRelationId)}::uuid[]
      ) AS affected(relation_table, entity_relation_id)
    ), current_votes AS (
      SELECT DISTINCT ON (votes.relation_table, votes.entity_relation_id, votes.user_id)
        votes.relation_table, votes.entity_relation_id, votes.user_id, votes.score
      FROM entity_relation_votes votes
      JOIN affected_ids affected USING (relation_table, entity_relation_id)
      ORDER BY votes.relation_table, votes.entity_relation_id, votes.user_id, votes.id DESC
    ), aggregated AS (
      SELECT
        current_votes.relation_table, current_votes.entity_relation_id,
        COALESCE(SUM(CASE WHEN score > 0 THEN score * users.vote_weight ELSE 0 END), 0)::double precision AS votes_score_up,
        0::double precision AS votes_score_none,
        COALESCE(-SUM(CASE WHEN score < 0 THEN score * users.vote_weight ELSE 0 END), 0)::double precision AS votes_score_down,
        COUNT(*) FILTER (WHERE score > 0)::integer AS votes_count_up,
        0::integer AS votes_count_none,
        COUNT(*) FILTER (WHERE score < 0)::integer AS votes_count_down
      FROM current_votes
      JOIN users ON users.id = current_votes.user_id AND users.deleted_at IS NULL
      GROUP BY current_votes.relation_table, current_votes.entity_relation_id
    ), stats AS (
      SELECT affected.relation_table, affected.entity_relation_id,
        COALESCE(aggregated.votes_score_up, 0) AS votes_score_up,
        COALESCE(aggregated.votes_score_none, 0) AS votes_score_none,
        COALESCE(aggregated.votes_score_down, 0) AS votes_score_down,
        COALESCE(aggregated.votes_count_up, 0) AS votes_count_up,
        COALESCE(aggregated.votes_count_none, 0) AS votes_count_none,
        COALESCE(aggregated.votes_count_down, 0) AS votes_count_down
      FROM affected_ids affected
      LEFT JOIN aggregated USING (relation_table, entity_relation_id)
    ), `

  const tables = [...electionTables]
  tables.forEach((table, index) => {
    if (index > 0) statement.append(sql`, `)
    statement.append(`current_${index} AS (SELECT
      relation.id, relation.subject_id, relation.object_id,
      relation.votes_score_net AS prior_votes_score_net
      FROM `)
    statement.append(assertWhitelistedSqlIdentifier(table, electionTables, 'entityRelationTable'))
    statement.append(sql` relation
      JOIN stats ON stats.entity_relation_id = relation.id
        AND stats.relation_table = ${table}
      ORDER BY relation.id
      FOR UPDATE OF relation
    ), `)
    statement.append(`updated_${index}`)
    statement.append(sql` AS (UPDATE `)
    statement.append(assertWhitelistedSqlIdentifier(table, electionTables, 'entityRelationTable'))
    statement.append(sql` relation SET
      votes_score_up = stats.votes_score_up,
      votes_score_none = stats.votes_score_none,
      votes_score_down = stats.votes_score_down,
      votes_count_up = stats.votes_count_up,
      votes_count_none = stats.votes_count_none,
      votes_count_down = stats.votes_count_down
      FROM stats, `)
    statement.append(`current_${index}`)
    statement.append(sql`
      WHERE relation.id = stats.entity_relation_id
        AND `)
    statement.append(`current_${index}`)
    statement.append(sql`.id = relation.id
      RETURNING relation.subject_id, relation.object_id,
        `)
    statement.append(`current_${index}`)
    statement.append(sql`.prior_votes_score_net,
        relation.votes_score_net AS next_votes_score_net
    )`)
  })
  statement.append(sql` `)
  tables.forEach((table, index) => {
    if (index > 0) statement.append(sql` UNION ALL `)
    statement.append(sql`SELECT ${table}::text AS relation_table, subject_id, object_id,
      prior_votes_score_net, next_votes_score_net FROM `)
    statement.append(`updated_${index}`)
  })
  return (await query<UpdatedEntityRelationVoteStats>(statement)).rows
}

export async function recordUserDeletionRelationPublicationChanges(
  changes: UpdatedEntityRelationVoteStats[],
  query: TransactionQuery,
): Promise<void> {
  const changesByTable = new Map<string, UpdatedEntityRelationVoteStats[]>()
  for (const change of changes) {
    if (change.prior_votes_score_net > 0 === change.next_votes_score_net > 0) continue
    if (!isPostPublicationRelationTable(change.relation_table)) continue
    const tableChanges = changesByTable.get(change.relation_table) ?? []
    tableChanges.push(change)
    changesByTable.set(change.relation_table, tableChanges)
  }
  for (const [relationTable, tableChanges] of [...changesByTable].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    // oxlint-disable-next-line no-await-in-loop -- sorted relation tables preserve publication lock order.
    await recordPostTopicRelationPublicationChanges(query, relationTable, tableChanges)
  }
}
