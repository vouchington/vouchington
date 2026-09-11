import {
  assertWhitelistedSqlIdentifier,
  beginTransaction,
  withTransactionOptions,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import { upsertVoteUserAgent } from '../shared/upsert-vote-user-agent.mts'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
  VoteEventContext,
} from '../shared/types.mts'
import { enqueueBulkUpdateEntityRelationElectionVoteStats } from '@queues/elections/enqueues'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
  type EntityRelationMetadata,
} from '@voucha/types/entities/entity-relations-metadata'
import sql from 'sql-template-strings'
import { createEntityRelationElectionTarget } from './target.mts'

const electionRelations = entityRelationMetadatum.filter(metadata => metadata.election)
const relationTables = new Set(electionRelations.map(metadata => metadata.table_name))
const relationVoteTables = new Set(electionRelations.map(getEntityRelationVoteTableName))

const NULL_VOTE_CONTEXT: VoteEventContext = {
  ipAddress: null,
  deviceId: null,
  sessionId: null,
  userAgent: null,
}

export async function upsertEntityRelationElectionVotes(
  userId: string,
  votes: Array<{ entityId: string; score: ElectionVoteScore }>,
  context: VoteEventContext = NULL_VOTE_CONTEXT,
  relationMetadata?: EntityRelationMetadata,
  options: QueryOptions & { enqueueVoteStats?: boolean } = {},
): Promise<ElectionVoteMutationResult[]> {
  if (votes.length === 0) return []
  if (relationMetadata && !relationMetadata.election) {
    throw new Error(
      `Entity relation ${relationMetadata.table_name} does not support election votes`,
    )
  }
  const targetRelations = relationMetadata ? [relationMetadata] : electionRelations

  const deduplicated = new Map<string, ElectionVoteScore>()
  for (const vote of votes) deduplicated.set(vote.entityId, vote.score)
  const values = [...deduplicated]
    .map(([entityId, score]) => ({ entityId, score }))
    .sort((left, right) => left.entityId.localeCompare(right.entityId))
  const { enqueueVoteStats = true, ...queryOptions } = options
  const userAgentId = await upsertVoteUserAgent(context.userAgent, queryOptions)

  const query = sql`/* upsertEntityRelationElectionVotes */
    WITH input_data AS (
      SELECT * FROM UNNEST(
        ${values.map(() => userId)}::uuid[],
        ${values.map(value => value.entityId)}::uuid[],
        ${values.map(value => value.score)}::smallint[],
        ${values.map(() => context.ipAddress)}::inet[],
        ${values.map(() => context.deviceId)}::uuid[],
        ${values.map(() => context.sessionId)}::uuid[],
        ${values.map(() => userAgentId)}::uuid[]
      ) AS input(user_id, entity_relation_id, score, ip_address, device_id, session_id, user_agent_id)
    ), matched_relations AS (`

  targetRelations.forEach((metadata, index) => {
    if (index > 0) query.append(sql` UNION ALL `)
    query.append(sql`SELECT `)
    query.append(`${index}::integer AS relation_index, relation.subject_id, input.*
      FROM input_data input
      JOIN `)
    query.append(
      assertWhitelistedSqlIdentifier(metadata.table_name, relationTables, 'entityRelationTable'),
    )
    query.append(sql` relation ON relation.id = input.entity_relation_id
      WHERE relation.deleted_at IS NULL`)
  })
  query.append(sql`), `)

  targetRelations.forEach((metadata, index) => {
    if (index > 0) query.append(sql`, `)
    query.append(`inserted_${index} AS (INSERT INTO `)
    query.append(
      assertWhitelistedSqlIdentifier(
        getEntityRelationVoteTableName(metadata),
        relationVoteTables,
        'entityRelationVoteTable',
      ),
    )
    query.append(sql` (
        relation_table, user_id, subject_id, entity_relation_id, score,
        ip_address, device_id, session_id, user_agent_id
      )
      SELECT ${metadata.table_name},
        user_id, subject_id, entity_relation_id, score,
        ip_address, device_id, session_id, user_agent_id
      FROM matched_relations
      WHERE relation_index = `)
    query.append(String(index))
    query.append(sql`
        AND score IS DISTINCT FROM (
          SELECT previous.score
          FROM `)
    query.append(
      assertWhitelistedSqlIdentifier(
        getEntityRelationVoteTableName(metadata),
        relationVoteTables,
        'entityRelationVoteTable',
      ),
    )
    query.append(sql` previous
          WHERE previous.user_id = ${userId}
            AND previous.entity_relation_id = matched_relations.entity_relation_id
          ORDER BY previous.id DESC
          LIMIT 1
        )
      RETURNING entity_relation_id AS entity_id, user_id, score, created_at
    )`)
  })

  query.append(sql` `)
  targetRelations.forEach((_metadata, index) => {
    if (index > 0) query.append(sql` UNION ALL `)
    query.append(
      `SELECT entity_id, user_id, score, created_at, '${targetRelations[index]!.table_name}'::text AS relation_table FROM inserted_${index}`,
    )
  })

  const run = async (transaction: TransactionQuery) => {
    await transaction(sql`/* lockActiveUserForEntityRelationElectionVoteMutation */
      SELECT fn_lock_active_user_for_mutation(${userId}::uuid)
    `)
    await transaction(sql`/* lockEntityRelationElectionVoteMutations */
      SELECT pg_advisory_xact_lock(
        hashtextextended('entity_relation_votes:' || ${userId} || ':' || ordered.entity_id::text, 0)
      )
      FROM (
        SELECT unnest(${values.map(value => value.entityId)}::uuid[]) AS entity_id
        ORDER BY entity_id
      ) ordered
    `)
    return transaction(query)
  }
  const { rows } =
    queryOptions.query || queryOptions.client
      ? await withTransactionOptions(queryOptions, run)
      : await upsertEntityRelationElectionVotesInOwnedTransaction(run)
  const upsertedVotes = rows as Array<ElectionVoteMutationResult & { relation_table: string }>
  const voteStatsTargets = relationMetadata
    ? values.map(vote =>
        createEntityRelationElectionTarget(vote.entityId, relationMetadata.table_name),
      )
    : upsertedVotes.map(vote =>
        createEntityRelationElectionTarget(vote.entity_id, vote.relation_table),
      )
  if (voteStatsTargets.length > 0 && enqueueVoteStats) {
    void enqueueBulkUpdateEntityRelationElectionVoteStats(voteStatsTargets)
  }
  return upsertedVotes.map(({ relation_table: _relationTable, ...vote }) => vote)
}

async function upsertEntityRelationElectionVotesInOwnedTransaction<T>(
  run: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
