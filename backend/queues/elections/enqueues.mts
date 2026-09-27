import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { elections } from './queues.mts'
import { QUEUE_NAME, ELECTIONS_ORDERING, ELECTIONS_DEFAULTS, PRIORITY_DEFAULT } from './config.mts'
import type {
  ElectionOrderingKey,
  ElectionsJobData,
  ElectionsJobs,
  EntityRelationElectionTarget,
} from './types.mts'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'

const PROCESSOR_NAME = 'processUpdateElectionVoteStats' as ElectionsJobs
const entityRelationElectionTables = new Set(
  entityRelationMetadatum.flatMap(metadata => (metadata.election ? [metadata.table_name] : [])),
)
export type { ElectionOrderingKey } from './types.mts'
type ElectionJobInput = ElectionsJobData['data']
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
      id: `${PROCESSOR_NAME}__${orderingKey}__${relationTable ? `${relationTable}__` : ''}${electionId}`,
      mode: 'throttle' as const,
      ttl: ELECTIONS_DEFAULTS.deduplicationTtlMs,
    },
    ordering: ELECTIONS_ORDERING[orderingKey],
    delay: ELECTIONS_DEFAULTS.recomputeDelayMs,
  }
}

const enqueueBulkElectionJobs = createBulkEnqueueFunction<
  ElectionJobInput,
  ElectionsJobData['data'],
  ElectionsJobs,
  ElectionErrorContext
>({
  queue: elections,
  queueName: QUEUE_NAME,
  jobName: PROCESSOR_NAME,
  defaults: {
    attempts: ELECTIONS_DEFAULTS.attempts,
    backoff: ELECTIONS_DEFAULTS.backoff,
    removeOnComplete: ELECTIONS_DEFAULTS.removeOnComplete,
    removeOnFail: ELECTIONS_DEFAULTS.removeOnFail,
  },
  buildJob: input => ({
    data: input,
    opts: buildElectionJobOptions(input.electionId, input.orderingKey, input.relationTable),
  }),
  decorateError: (error, context) => {
    error.extra = {
      queue: context.queueName,
      operation: context.callContext?.operation,
      electionCount: context.count,
    }
    error.tags = { critical: true }
    return error
  },
})

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
    { priority: priority ?? PRIORITY_DEFAULT } satisfies Partial<JobOptions>,
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
      { priority: priority ?? PRIORITY_DEFAULT } satisfies Partial<JobOptions>,
      { operation },
    )
}
