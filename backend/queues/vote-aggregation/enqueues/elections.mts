import type { EnqueueReturnType } from '@voucha/types'
import { createBackgroundBulkEnqueue } from '@queues/background/enqueues'
import {
  type ElectionJobData,
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { ELECTIONS_DEFAULTS } from './config-elections.mts'
import type {
  ElectionJobInput,
  ElectionOrderingKey,
  EntityRelationElectionTarget,
} from './types-elections.mts'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'

const entityRelationElectionTables = new Set(
  entityRelationMetadatum.flatMap(metadata => (metadata.election ? [metadata.table_name] : [])),
)
export type { ElectionOrderingKey } from './types-elections.mts'
// Kept from the old queue so a replayed throttle window still collapses onto the same id.
const DEDUPLICATION_PREFIX = 'processUpdateElectionVoteStats'
type ElectionErrorContext = {
  operation: string
}

export function buildElectionJobOptions(
  electionId: string,
  orderingKey: ElectionOrderingKey,
  relationTable?: string,
) {
  return {
    deduplication: {
      id: `${DEDUPLICATION_PREFIX}__${orderingKey}__${relationTable ? `${relationTable}__` : ''}${electionId}`,
      mode: 'throttle' as const,
      ttl: ELECTIONS_DEFAULTS.deduplicationTtlMs,
    },
    delay: ELECTIONS_DEFAULTS.recomputeDelayMs,
  }
}

const enqueueBulkElectionJobs = createBackgroundBulkEnqueue<ElectionJobInput, ElectionJobData>(
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
  input => ({
    data: input,
    opts: buildElectionJobOptions(input.electionId, input.orderingKey, input.relationTable),
  }),
  {
    decorateError: (error, context) => {
      error.extra = {
        queue: context.queueName,
        operation: (context.callContext as ElectionErrorContext | undefined)?.operation,
        electionCount: context.count,
      }
      error.tags = { critical: true }
      return error
    },
  },
)

/** The call-level options: a priority only when the caller names one, else the job's default. */
function priorityOptions(priority?: number): { priority?: number } {
  return priority === undefined ? {} : { priority }
}

export const enqueueBulkUpdatePostElectionVoteStats = createElectionBulkEnqueue(
  'post',
  'enqueueBulkUpdatePostElectionVoteStats',
)

export const enqueueBulkUpdateTopicElectionVoteStats = createElectionBulkEnqueue(
  'topic',
  'enqueueBulkUpdateTopicElectionVoteStats',
)

export const enqueueBulkUpdateHostnameElectionVoteStats = createElectionBulkEnqueue(
  'hostname',
  'enqueueBulkUpdateHostnameElectionVoteStats',
)

export const enqueueBulkUpdateAgentModerationElectionVoteStats = createElectionBulkEnqueue(
  'agent_moderation',
  'enqueueBulkUpdateAgentModerationElectionVoteStats',
)

export function enqueueBulkUpdateEntityRelationElectionVoteStats(
  targets: EntityRelationElectionTarget[],
  priority?: number,
): EnqueueReturnType {
  return enqueueBulkElectionJobs(
    targets.map(target => {
      if (!entityRelationElectionTables.has(target.relationTable)) {
        throw new Error(`Unknown election entity-relation table: ${target.relationTable}`)
      }
      return {
        electionId: target.entityRelationId,
        relationTable: target.relationTable,
        orderingKey: 'entity_relation' as const,
      }
    }),
    priorityOptions(priority),
    { operation: 'enqueueBulkUpdateEntityRelationElectionVoteStats' },
  )
}

export const enqueueBulkUpdateRssFeedItemElectionVoteStats = createElectionBulkEnqueue(
  'rss_feed_item',
  'enqueueBulkUpdateRssFeedItemElectionVoteStats',
)

export const enqueueBulkUpdateUserVouchElectionVoteStats = createElectionBulkEnqueue(
  'user_vouch',
  'enqueueBulkUpdateUserVouchElectionVoteStats',
)

function createElectionBulkEnqueue(
  orderingKey: Exclude<ElectionOrderingKey, 'entity_relation'>,
  operation: string,
) {
  return (electionIds: string[], priority?: number): EnqueueReturnType =>
    enqueueBulkElectionJobs(
      electionIds.map(electionId => ({ electionId, orderingKey })),
      priorityOptions(priority),
      { operation },
    )
}
