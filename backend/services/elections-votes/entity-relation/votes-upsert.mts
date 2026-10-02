import {
  assertWhitelistedSqlIdentifier,
  beginTransaction,
  withTransactionOptions,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
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
  const normalizedUserId = userId.toLowerCase()
  if (relationMetadata && !relationMetadata.election) {
    throw new Error(
      `Entity relation ${relationMetadata.table_name} does not support election votes`,
    )
  }
  const targetRelations = relationMetadata ? [relationMetadata] : electionRelations

  const deduplicated = new Map<string, ElectionVoteScore>()
  for (const vote of votes) deduplicated.set(vote.entityId.toLowerCase(), vote.score)
  const values = [...deduplicated]
    .map(([entityId, score]) => ({ entityId, score }))
    .toSorted((left, right) => left.entityId.localeCompare(right.entityId))
  const { enqueueVoteStats = true, ...queryOptions } = options
  const userAgentId = await upsertUserAgentString(context.userAgent?.trim() || null, queryOptions)

  const query = sql`/* upsertEntityRelationElectionVotes */
    WITH input_data AS (
      SELECT * FROM UNNEST(
        ${values.map(() => normalizedUserId)}::uuid[],
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
      -- A zero vote may neutralize a retained vote after the relation is soft-deleted.
      -- Positive votes remain restricted to active relations.
      WHERE relation.deleted_at IS NULL OR input.score = 0`)
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
        user_id, subject_id, entity_relation_id, score,
        ip_address, device_id, session_id, user_agent_id
      )
      SELECT user_id, subject_id, entity_relation_id, score,
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
          WHERE previous.user_id = ${normalizedUserId}
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
      `SELECT entity_id, user_id, score, created_at, '${targetRelations[index]!.table_name}'::text AS entity_relation FROM inserted_${index}`,
    )
  })

  const run = async (transaction: TransactionQuery) => {
    await transaction(sql`/* lockActiveUserForEntityRelationElectionVoteMutation */
      SELECT fn_lock_active_user_for_mutation(${normalizedUserId}::uuid)
    `)
    const locks = targetRelations
      .flatMap(metadata =>
        values.map(value => ({
          key: `${getEntityRelationVoteTableName(metadata)}:${normalizedUserId}:${value.entityId}`,
        })),
      )
      .toSorted((left, right) => left.key.localeCompare(right.key))
    await transaction(sql`/* lockEntityRelationElectionVoteMutations */
      SELECT pg_advisory_xact_lock(hashtextextended(ordered.lock_key, 0))
      FROM (SELECT unnest(${locks.map(lock => lock.key)}::text[]) AS lock_key ORDER BY lock_key) ordered
    `)
    return transaction(query)
  }
  const { rows } =
    queryOptions.query || queryOptions.client
      ? await withTransactionOptions(queryOptions, run)
      : await upsertEntityRelationElectionVotesInOwnedTransaction(run)
  const upsertedVotes = rows as Array<ElectionVoteMutationResult & { entity_relation: string }>
  const voteStatsTargets = relationMetadata
    ? values.map(vote =>
        createEntityRelationElectionTarget(vote.entityId, relationMetadata.table_name),
      )
    : upsertedVotes.map(vote =>
        createEntityRelationElectionTarget(vote.entity_id, vote.entity_relation),
      )
  if (voteStatsTargets.length > 0 && enqueueVoteStats) {
    void enqueueBulkUpdateEntityRelationElectionVoteStats(voteStatsTargets)
  }
  return upsertedVotes.map(({ entity_relation: _relationTable, ...vote }) => vote)
}

async function upsertEntityRelationElectionVotesInOwnedTransaction<T>(
  run: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
