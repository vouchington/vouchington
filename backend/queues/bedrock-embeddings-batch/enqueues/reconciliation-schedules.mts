import type { ScheduledJobDefinition } from '../../../modules/scheduled-job-manifest/types.mts'
import {
  enqueuePostEmbeddingTriggerRecovery,
  enqueueReconcileExistingEmbeddings,
  enqueueRssStoryTriggerRecovery,
  reconciliationJobOptions,
} from '../enqueues.mts'

export const reconciliationScheduleEntries = [
  {
    schedulerId: 'reconcile_existing_topics',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'reconcile_existing',
      data: { entityType: 'topics' },
      opts: reconciliationJobOptions('copy:topics'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcile_existing_topics',
        schedule: '* * * * *',
        description: 'Copy reusable topic embeddings from the centralized table',
        trigger: () => enqueueReconcileExistingEmbeddings('topics'),
      },
      { kind: 'backfill', backfillId: 'bedrock-embedding-reconciliation' },
    ],
  },
  {
    schedulerId: 'reconcile_existing_posts',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'reconcile_existing',
      data: { entityType: 'posts' },
      opts: reconciliationJobOptions('copy:posts'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcile_existing_posts',
        schedule: '* * * * *',
        description: 'Copy reusable post embeddings from the centralized table',
        trigger: () => enqueueReconcileExistingEmbeddings('posts'),
      },
    ],
  },
  {
    schedulerId: 'reconcile_existing_rss_feed_items',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'reconcile_existing',
      data: { entityType: 'rss_feed_items' },
      opts: reconciliationJobOptions('copy:rss_feed_items'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcile_existing_rss_feed_items',
        schedule: '* * * * *',
        description: 'Copy reusable RSS item embeddings from the centralized table',
        trigger: () => enqueueReconcileExistingEmbeddings('rss_feed_items'),
      },
    ],
  },
  {
    schedulerId: 'post_trigger_recovery',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'post_trigger_recovery',
      data: {},
      opts: reconciliationJobOptions('post-trigger'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'post_trigger_recovery',
        schedule: '* * * * *',
        description: 'Recover ban-evasion delivery for current first-community-post embeddings',
        trigger: enqueuePostEmbeddingTriggerRecovery,
      },
    ],
  },
  {
    schedulerId: 'rss_story_trigger_recovery',
    registration: 'sequential',
    repeat: { pattern: '* * * * *' },
    template: {
      name: 'rss_story_trigger_recovery',
      data: {},
      opts: reconciliationJobOptions('rss-story-trigger'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'rss_story_trigger_recovery',
        schedule: '* * * * *',
        description: 'Recover story-clustering delivery for current RSS item embeddings',
        trigger: enqueueRssStoryTriggerRecovery,
      },
    ],
  },
] satisfies ScheduledJobDefinition[]
