import { read, type QueryExecutor } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { EntityElectionConfig } from './types.mts'

export type ElectionVoteUserPagination = { limit: number; afterEntityId?: string }
export type ElectionVoteEntityPagination = { limit: number; afterUserId?: string }

/**
 * Fetches raw current-vote-per-entity rows for a user (DISTINCT ON keeps the most recent row
 * per entity in the append-only vote table). Returns unmapped rows — callers must run
 * mapCurrentVotes() to get ElectionVote[]. When `pagination` is omitted, no cursor filter or
 * LIMIT is appended, matching the historical unbounded behavior relied on by every non-route
 * caller (batch vote lookups) and by the write-path single-vote lookup.
 */
export async function fetchElectionVoteRowsByUser(
  config: EntityElectionConfig,
  userId: string,
  entityIds: string[] | undefined,
  run: QueryExecutor,
  pagination?: ElectionVoteUserPagination,
): Promise<Record<string, unknown>[]> {
  const query = sql`/* fetchElectionVoteRowsByUser */
    SELECT DISTINCT ON (election_vote.`
  query.append(config.entityIdColumn)
  query.append(sql`) `)
  query.append(sql`election_vote.`)
  query.append(config.entityIdColumn)
  query.append(
    sql` AS entity_id, election_vote.user_id, election_vote.score, election_vote.created_at`,
  )
  appendScoreProvenanceFields(config, query)
  appendVotePolicyEntityField(config, query)
  query.append(sql`
    FROM `)
  query.append(config.voteTable)
  query.append(sql` AS election_vote`)
  appendVotePolicyEntityJoin(config, query)
  query.append(sql`
    WHERE election_vote.user_id = ${userId}
  `)

  if (entityIds && entityIds.length > 0) {
    query.append(sql` AND election_vote.`)
    query.append(config.entityIdColumn)
    query.append(sql` = ANY(${entityIds})`)
  }
  if (pagination?.afterEntityId) {
    query.append(sql` AND election_vote.`)
    query.append(config.entityIdColumn)
    query.append(sql` > ${pagination.afterEntityId}`)
  }

  query.append(sql` ORDER BY election_vote.`)
  query.append(config.entityIdColumn)
  query.append(sql`, election_vote.id DESC`)
  if (pagination) query.append(sql` LIMIT ${pagination.limit}`)

  const { rows } = await run(query)
  return rows
}

/**
 * Fetches raw current-vote-per-user rows for a single entity (DISTINCT ON keeps the most
 * recent row per user). Returns unmapped rows — callers must run mapCurrentVotes(). Always
 * paginated: the only caller is the admin vote-history read path.
 */
export async function fetchElectionVoteRowsByEntityId(
  config: EntityElectionConfig,
  entityId: string,
  pagination: ElectionVoteEntityPagination,
  run: QueryExecutor = read,
): Promise<Record<string, unknown>[]> {
  const query = sql`/* fetchElectionVoteRowsByEntityId */
    SELECT DISTINCT ON (election_vote.user_id) `
  query.append(sql`election_vote.`)
  query.append(config.entityIdColumn)
  query.append(
    sql` AS entity_id, election_vote.user_id, election_vote.score, election_vote.created_at`,
  )
  appendScoreProvenanceFields(config, query)
  appendVotePolicyEntityField(config, query)
  query.append(sql`
    FROM `)
  query.append(config.voteTable)
  query.append(sql` AS election_vote`)
  appendVotePolicyEntityJoin(config, query)
  query.append(sql`
    WHERE election_vote.`)
  query.append(config.entityIdColumn)
  query.append(sql` = ${entityId}`)
  if (pagination.afterUserId) {
    query.append(sql` AND election_vote.user_id > ${pagination.afterUserId}`)
  }
  query.append(sql`
    ORDER BY election_vote.user_id, election_vote.id DESC
    LIMIT ${pagination.limit}
  `)

  const { rows } = await run(query)
  return rows
}

function appendVotePolicyEntityField(config: EntityElectionConfig, query: SQLStatement): void {
  if (!config.votePolicyByEntityField) return
  query.append(sql`, election_entity.`)
  query.append(config.votePolicyByEntityField.field)
  query.append(sql` AS vote_policy_entity_field`)
}

function appendScoreProvenanceFields(config: EntityElectionConfig, query: SQLStatement): void {
  if (config.tracksNeutralScore) query.append(sql`, election_vote.score_is_neutral`)
  if (config.tracksSemanticScore) query.append(sql`, election_vote.score_is_semantic`)
}

function appendVotePolicyEntityJoin(config: EntityElectionConfig, query: SQLStatement): void {
  if (!config.votePolicyByEntityField) return
  if (!config.entityTable)
    throw new Error(`Vote policy entity field requires an entity table for ${config.voteTable}`)
  query.append(sql` JOIN `)
  query.append(config.entityTable)
  query.append(sql` AS election_entity ON election_entity.id = election_vote.`)
  query.append(config.entityIdColumn)
}
