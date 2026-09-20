import type { ScheduleDefinition } from '@backend/worker-runtime'
import { SCHEDULE_DEFINITIONS as IO_SCHEDULE_DEFINITIONS } from '@entrypoints/worker-io/definitions'

export const CPU_ONLY_SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
  {
    // The heartbeat queue is universal and intentionally omitted from QUEUES. This schedule is
    // registered by worker-cpu only, so queue metrics have one publisher even when worker-io is
    // enabled alongside it.
    queueName: 'heartbeat',
    alwaysRun: true,
    load: () =>
      import('@queues/heartbeat/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'crawl_hostnames',
    load: () =>
      import('@queues/crawl-hostnames/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'crawl_html_boilerplate_removal',
    load: () =>
      import('@queues/crawl-boilerplate-removal/enqueues/schedules').then(
        module => module.upsertSchedules,
      ),
  },
  {
    queueName: 'crawl_referral_links',
    load: () =>
      import('@queues/crawl-referral-links/enqueues/schedules').then(
        module => module.upsertSchedules,
      ),
  },
  {
    queueName: 'unfurl_referral_links',
    load: () =>
      import('@queues/unfurl-referral-links/enqueues/schedules').then(
        module => module.upsertSchedules,
      ),
  },
  {
    queueName: 'images',
    load: () => import('@queues/images/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'openai_moderation_omni_single',
    load: () =>
      import('@queues/openai-moderation/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'bedrock-embeddings-batch',
    load: () =>
      import('@queues/bedrock-embeddings-batch/enqueues/schedules').then(
        module => module.upsertSchedules,
      ),
  },
  {
    queueName: 'ai_agents',
    load: () =>
      import('@queues/ai-agents/enqueues/schedules').then(module => module.upsertSchedules),
  },
]

export const SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
  ...CPU_ONLY_SCHEDULE_DEFINITIONS,
  ...IO_SCHEDULE_DEFINITIONS,
]
