import type { JobOptions } from 'glide-mq'
import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { reconciliationScheduleEntries } from './reconciliation-schedules.mts'
import {
  enqueueEmbeddingsBatchBacklogDispatcher,
  enqueueEmbeddingsBatchCreationDispatcher,
  enqueueEmbeddingsBatchPollDispatcher,
  enqueueEmbeddingsBatchStaleCleanupDispatcher,
} from '../enqueues.mts'

const DISPATCHER_OPTIONS = {
  ...requireBackgroundCpuJob('bedrock-embeddings.poll_dispatcher').options,
} satisfies JobOptions

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_CPU_QUEUE_NAME, [
  ...reconciliationScheduleEntries,
  {
    schedulerId: 'bedrock-embeddings:poll-dispatcher',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'bedrock-embeddings.poll_dispatcher',
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'bedrock-embeddings:poll-dispatcher',
        schedule: '* * * * *',
        description: 'Poll Bedrock batch embeddings status',
        trigger: enqueueEmbeddingsBatchPollDispatcher,
      },
      { kind: 'backfill', backfillId: 'bedrock-embeddings-poll-dispatch' },
    ],
  },
  {
    schedulerId: 'bedrock-embeddings:creation-dispatcher',
    registration: 'sequential',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'bedrock-embeddings.creation_dispatcher',
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'bedrock-embeddings:creation-dispatcher',
        schedule: '*/5 * * * *',
        description: 'Create new Bedrock batch embedding requests',
        trigger: enqueueEmbeddingsBatchCreationDispatcher,
      },
    ],
  },
  {
    schedulerId: 'bedrock-embeddings:backlog-dispatcher',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'bedrock-embeddings.backlog_dispatcher',
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'bedrock-embeddings:backlog-dispatcher',
        schedule: '* * * * *',
        description:
          'Trigger creation_dispatcher when single embeddings backlog exceeds the backlog_threshold (default 1000, configurable via Dynamic Config)',
        trigger: enqueueEmbeddingsBatchBacklogDispatcher,
      },
    ],
  },
  {
    schedulerId: 'bedrock-embeddings:stale-cleanup-dispatcher',
    registration: 'sequential',
    repeat: { pattern: '0 * * * *' },
    template: {
      name: 'bedrock-embeddings.stale_cleanup_dispatcher',
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'bedrock-embeddings:stale-cleanup-dispatcher',
        schedule: '0 * * * *',
        description:
          'Stop and cancel Bedrock batches stuck in Submitted/InProgress past stale_ttl_hours (default 24h, configurable via Dynamic Config)',
        trigger: enqueueEmbeddingsBatchStaleCleanupDispatcher,
      },
    ],
  },
])
