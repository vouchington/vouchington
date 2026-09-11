import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { bedrock_embeddings_batch } from '../queues.mts'
import {
  BEDROCK_EMBEDDINGS_BATCH_ORDERING,
  BEDROCK_EMBEDDINGS_BATCH_DEFAULTS,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import type { BedrockEmbeddingsBatchDispatcherJob } from '../types.mts'
import {
  enqueueEmbeddingsBatchBacklogDispatcher,
  enqueueEmbeddingsBatchCreationDispatcher,
  enqueueEmbeddingsBatchPollDispatcher,
  enqueueEmbeddingsBatchStaleCleanupDispatcher,
} from '../enqueues.mts'

const DISPATCHER_OPTIONS = {
  attempts: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.attempts,
  backoff: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.backoff,
  removeOnComplete: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.removeOnComplete,
  removeOnFail: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.removeOnFail,
  priority: PRIORITY_DISPATCHER,
  ordering: BEDROCK_EMBEDDINGS_BATCH_ORDERING.dispatcher,
} satisfies JobOptions

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'poll_dispatcher',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'poll_dispatcher' as BedrockEmbeddingsBatchDispatcherJob,
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'poll_dispatcher',
        schedule: '* * * * *',
        description: 'Poll Bedrock batch embeddings status',
        trigger: enqueueEmbeddingsBatchPollDispatcher,
      },
      { kind: 'backfill', backfillId: 'bedrock-embeddings-poll-dispatch' },
    ],
  },
  {
    schedulerId: 'creation_dispatcher',
    registration: 'sequential',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'creation_dispatcher' as BedrockEmbeddingsBatchDispatcherJob,
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'creation_dispatcher',
        schedule: '*/5 * * * *',
        description: 'Create new Bedrock batch embedding requests',
        trigger: enqueueEmbeddingsBatchCreationDispatcher,
      },
    ],
  },
  {
    schedulerId: 'backlog_dispatcher',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'backlog_dispatcher' as BedrockEmbeddingsBatchDispatcherJob,
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'backlog_dispatcher',
        schedule: '* * * * *',
        description:
          'Trigger creation_dispatcher when single embeddings backlog exceeds the backlog_threshold (default 1000, configurable via Dynamic Config)',
        trigger: enqueueEmbeddingsBatchBacklogDispatcher,
      },
    ],
  },
  {
    schedulerId: 'stale_cleanup_dispatcher',
    registration: 'sequential',
    repeat: { pattern: '0 * * * *' },
    template: {
      name: 'stale_cleanup_dispatcher' as BedrockEmbeddingsBatchDispatcherJob,
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'stale_cleanup_dispatcher',
        schedule: '0 * * * *',
        description:
          'Stop and cancel Bedrock batches stuck in Submitted/InProgress past stale_ttl_hours (default 24h, configurable via Dynamic Config)',
        trigger: enqueueEmbeddingsBatchStaleCleanupDispatcher,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(bedrock_embeddings_batch, scheduledJobManifest)
}
