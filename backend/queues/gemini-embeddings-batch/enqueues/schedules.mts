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
  ...requireBackgroundCpuJob('gemini-embeddings.poll_dispatcher').options,
} satisfies JobOptions

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_CPU_QUEUE_NAME, [
  ...reconciliationScheduleEntries,
  {
    schedulerId: 'gemini-embeddings:poll-dispatcher',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'gemini-embeddings.poll_dispatcher',
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'gemini-embeddings:poll-dispatcher',
        schedule: '* * * * *',
        description: 'Poll Gemini batch embeddings status',
        trigger: enqueueEmbeddingsBatchPollDispatcher,
      },
      { kind: 'backfill', backfillId: 'gemini-embeddings-poll-dispatch' },
    ],
  },
  {
    schedulerId: 'gemini-embeddings:creation-dispatcher',
    registration: 'sequential',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'gemini-embeddings.creation_dispatcher',
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'gemini-embeddings:creation-dispatcher',
        schedule: '*/5 * * * *',
        description: 'Create new Gemini batch embedding requests',
        trigger: enqueueEmbeddingsBatchCreationDispatcher,
      },
    ],
  },
  {
    schedulerId: 'gemini-embeddings:backlog-dispatcher',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'gemini-embeddings.backlog_dispatcher',
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'gemini-embeddings:backlog-dispatcher',
        schedule: '* * * * *',
        description:
          'Trigger creation_dispatcher when single embeddings backlog exceeds the backlog_threshold (default 1000, configurable via Dynamic Config)',
        trigger: enqueueEmbeddingsBatchBacklogDispatcher,
      },
    ],
  },
  {
    schedulerId: 'gemini-embeddings:stale-cleanup-dispatcher',
    registration: 'sequential',
    repeat: { pattern: '0 * * * *' },
    template: {
      name: 'gemini-embeddings.stale_cleanup_dispatcher',
      data: {},
      opts: DISPATCHER_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'gemini-embeddings:stale-cleanup-dispatcher',
        schedule: '0 * * * *',
        description:
          'Stop and cancel Gemini batches stuck in Submitted/InProgress past stale_ttl_hours (default 24h, configurable via Dynamic Config)',
        trigger: enqueueEmbeddingsBatchStaleCleanupDispatcher,
      },
    ],
  },
])
