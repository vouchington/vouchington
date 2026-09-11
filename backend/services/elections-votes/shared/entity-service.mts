import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { validateUUID } from '@modules/utils/ids'
import createError from 'http-errors'
import type { PageInfo } from '@voucha/types/pagination'
import type {
  ElectionVote,
  ElectionVoteMutationResult,
  ElectionVoteScore,
  EntityElectionConfig,
  ViewBaseElection,
  VoteEventContext,
} from './types.mts'
import type { ElectionVotePolicy } from '@voucha/types/entities/election'
import {
  aggregateElectionVoteStatsFromReplica,
  updateElectionStatsIfChanged,
} from './vote-aggregation.mts'
import { upsertElectionVotesShared } from './vote-upsert.mts'
import {
  getElectionVoteByUser,
  getElectionVotesByEntityId,
  getElectionVotesByUser,
  getElectionVotesByUserForEntity,
} from './vote-get.mts'

export function createVoteStatsUpdater(
  config: EntityElectionConfig,
  options: {
    invalidate: (entityId: string) => Promise<void>
    afterUpdate?: (entityId: string) => Promise<void>
  },
) {
  return async function updateEntityVoteStats(entityId: string): Promise<void> {
    // Intentionally replica-sourced + delayed; see aggregateElectionVoteStatsFromReplica docstring and #7352.
    // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
    const stats = await aggregateElectionVoteStatsFromReplica(config, entityId)
    await updateElectionStatsIfChanged(config, entityId, stats)
    await options.invalidate(entityId)
    await options.afterUpdate?.(entityId)
  }
}

export function createVotesUpsert(
  config: EntityElectionConfig,
  options: {
    enqueueElectionStats: (entityIds: string[]) => unknown
    getEntityIds?: (
      votes: Array<{ entityId: string; score: ElectionVoteScore }>,
      upsertedVotes: ElectionVoteMutationResult[],
    ) => string[]
    afterUpsert?: (
      entityIds: string[],
      upsertedVotes: ElectionVoteMutationResult[],
    ) => Promise<void>
  },
) {
  return async function upsertElectionVotes(
    userId: string,
    votes: Array<{ entityId: string; score: ElectionVoteScore }>,
    context: VoteEventContext = {
      ipAddress: null,
      deviceId: null,
      sessionId: null,
      userAgent: null,
    },
  ): Promise<ElectionVoteMutationResult[]> {
    const upsertedVotes = await upsertElectionVotesShared(config, userId, votes, context)
    const entityIds = options.getEntityIds?.(votes, upsertedVotes) ?? [
      ...new Set(votes.map(vote => vote.entityId)),
    ]

    // Fire-and-forget: the queue factory already reports failures via onError internally,
    // so awaiting here would only turn a transient Valkey/queue outage into a user-facing
    // 500 after the vote has already committed to PostgreSQL.
    void options.enqueueElectionStats(entityIds)
    await options.afterUpsert?.(entityIds, upsertedVotes)

    return upsertedVotes
  }
}

export function createVotesGetByUser<TPolicy extends ElectionVotePolicy>(
  config: EntityElectionConfig,
) {
  return function getVotesByUser(
    userId: string,
    entityIds?: string[],
  ): Promise<ElectionVote<TPolicy>[]> {
    return getElectionVotesByUser(config, userId, entityIds) as Promise<ElectionVote<TPolicy>[]>
  }
}

export function createVotesGetByElectionId<TPolicy extends ElectionVotePolicy>(
  config: EntityElectionConfig,
) {
  return function getVotesByEntityId(
    entityId: string,
    pagination: { limit: number; after?: string },
  ): Promise<{ results: ElectionVote<TPolicy>[]; page_info: PageInfo }> {
    return getElectionVotesByEntityId(config, entityId, pagination) as Promise<{
      results: ElectionVote<TPolicy>[]
      page_info: PageInfo
    }>
  }
}

export function createVotesGetByUserForEntity<TPolicy extends ElectionVotePolicy>(
  config: EntityElectionConfig,
) {
  return function getVotesByUserForEntity(
    userId: string,
    entityId: string,
    pagination: { limit: number; after?: string },
  ): Promise<{ results: ElectionVote<TPolicy>[]; page_info: PageInfo }> {
    return getElectionVotesByUserForEntity(config, userId, entityId, pagination) as Promise<{
      results: ElectionVote<TPolicy>[]
      page_info: PageInfo
    }>
  }
}

export function createVoteGetByUser<TPolicy extends ElectionVotePolicy>(
  config: EntityElectionConfig,
) {
  return function getVoteByUser(
    userId: string,
    entityId: string,
  ): Promise<ElectionVote<TPolicy> | null> {
    return getElectionVoteByUser(config, userId, entityId) as Promise<ElectionVote<TPolicy> | null>
  }
}

export function createElectionGetter<T extends ViewBaseElection>(config: EntityElectionConfig) {
  if (!config.entityTable)
    throw new Error(
      `BUG: createElectionGetter requires a non-null entityTable (got: ${config.entityType})`,
    )
  const deletedAtClause = config.deletedAtFilter ? ' AND deleted_at IS NULL' : ''
  return async function getElectionById(entityId: string): Promise<T | null> {
    validateUUID(entityId)
    const { rows } = await read(
      `/* getElectionById */
      SELECT '${config.entityType}' AS __entity_type, id, votes_score_net, votes_count_up, votes_count_down
      FROM ${config.entityTable}
      WHERE id = $1${deletedAtClause}`,
      [entityId],
    )
    return (rows[0] as T | undefined) ?? null
  }
}

export function createElectionBatchGetter<T extends ViewBaseElection>(
  config: EntityElectionConfig,
) {
  const alias = config.entityTable?.[0] ?? 't'
  const deletedAtClause = config.deletedAtFilter ? `\n    WHERE ${alias}.deleted_at IS NULL` : ''
  return async function getElectionsByIdBatch(
    entityIds: string[],
  ): Promise<Array<T | null | undefined>> {
    if (entityIds.length === 0) return []

    for (const id of entityIds) {
      if (!isUUID(id)) {
        throw createError(422, `Invalid ID: ${id}`)
      }
    }

    const positions = entityIds.map((_, index) => index)
    const { rows } = await read(
      `/* getElectionsByIdBatch */
      WITH input_data AS (
        SELECT unnest($1::uuid[]) AS input_value,
               unnest($2::int[]) AS input_order
      )
      SELECT '${config.entityType}' AS __entity_type, ${alias}.id, ${alias}.votes_score_net, ${alias}.votes_count_up, ${alias}.votes_count_down,
             input_data.input_order
      FROM ${config.entityTable} ${alias}
      JOIN input_data ON ${alias}.id = input_data.input_value${deletedAtClause}
      ORDER BY input_data.input_order`,
      [entityIds, positions],
    )

    const results: Array<T | null | undefined> = new Array(entityIds.length).fill(null)
    for (const row of rows) {
      const { input_order, ...data } = row
      results[input_order] = data as T
    }
    return results
  }
}
