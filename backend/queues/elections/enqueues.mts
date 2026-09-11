import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { elections } from './queues.mts'
import { QUEUE_NAME, ELECTIONS_ORDERING, ELECTIONS_DEFAULTS, PRIORITY_DEFAULT } from './config.mts'
import type { ElectionsJobs, EntityRelationElectionTarget } from './types.mts'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'

const PROCESSOR_NAME = 'processUpdateElectionVoteStats' as ElectionsJobs
const entityRelationElectionTables = new Set(
  entityRelationMetadatum.flatMap(metadata => (metadata.election ? [metadata.table_name] : [])),
)
export type ElectionOrderingKey = keyof typeof ELECTIONS_ORDERING
type ElectionJobInput = {
  electionId: string
  orderingKey: ElectionOrderingKey
  relationTable?: string
}
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
  { electionId: string; relationTable?: string },
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
  buildJob: ({ electionId, orderingKey, relationTable }) => ({
    data: { electionId, ...(relationTable ? { relationTable } : {}) },
    opts: buildElectionJobOptions(electionId, orderingKey, relationTable),
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

const postElectionEnqueue = createElectionBulkEnqueue(
  'post',
  'enqueueBulkUpdatePostElectionVoteStats',
)
export const enqueueBulkUpdatePostElectionVoteStats = postElectionEnqueue.enqueue
export const enqueueBulkUpdatePostElectionVoteStatsAndWait = postElectionEnqueue.enqueueAndWait

const topicElectionEnqueue = createElectionBulkEnqueue(
  'topic',
  'enqueueBulkUpdateTopicElectionVoteStats',
)
export const enqueueBulkUpdateTopicElectionVoteStats = topicElectionEnqueue.enqueue
export const enqueueBulkUpdateTopicElectionVoteStatsAndWait = topicElectionEnqueue.enqueueAndWait

const hostnameElectionEnqueue = createElectionBulkEnqueue(
  'hostname',
  'enqueueBulkUpdateHostnameElectionVoteStats',
)
export const enqueueBulkUpdateHostnameElectionVoteStats = hostnameElectionEnqueue.enqueue
export const enqueueBulkUpdateHostnameElectionVoteStatsAndWait =
  hostnameElectionEnqueue.enqueueAndWait

const agentModerationElectionEnqueue = createElectionBulkEnqueue(
  'agent_moderation',
  'enqueueBulkUpdateAgentModerationElectionVoteStats',
)
export const enqueueBulkUpdateAgentModerationElectionVoteStats =
  agentModerationElectionEnqueue.enqueue

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

const rssFeedItemElectionEnqueue = createElectionBulkEnqueue(
  'rss_feed_item',
  'enqueueBulkUpdateRssFeedItemElectionVoteStats',
)
export const enqueueBulkUpdateRssFeedItemElectionVoteStats = rssFeedItemElectionEnqueue.enqueue
export const enqueueBulkUpdateRssFeedItemElectionVoteStatsAndWait =
  rssFeedItemElectionEnqueue.enqueueAndWait

const userVouchElectionEnqueue = createElectionBulkEnqueue(
  'user_vouch',
  'enqueueBulkUpdateUserVouchElectionVoteStats',
)
export const enqueueBulkUpdateUserVouchElectionVoteStats = userVouchElectionEnqueue.enqueue
export const enqueueBulkUpdateUserVouchElectionVoteStatsAndWait =
  userVouchElectionEnqueue.enqueueAndWait

function createElectionBulkEnqueue(orderingKey: ElectionOrderingKey, operation: string) {
  const enqueueJobs = (electionIds: string[], priority?: number) => {
    return enqueueBulkElectionJobs(
      electionIds.map(electionId => ({ electionId, orderingKey })),
      { priority: priority ?? PRIORITY_DEFAULT } satisfies Partial<JobOptions>,
      { operation },
    )
  }

  return {
    enqueue: (electionIds: string[], priority?: number): EnqueueReturnType =>
      enqueueJobs(electionIds, priority),
    enqueueAndWait: (electionIds: string[], priority?: number): Promise<void> =>
      enqueueJobs(electionIds, priority).then(() => undefined),
  }
}
