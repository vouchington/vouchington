import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'
import { enqueueReconcileAutoDispatchJudgements } from './reconcile-auto-dispatch.mts'
import { enqueueReconcileBackgroundResponses } from './reconcile-background-responses.mts'
import { enqueueReconcileChatRuntimeGenerations } from './reconcile-chat-runtime-generations.mts'
import { enqueueReconcileMemberSupportAgentIntents } from './reconcile-member-support-agent-intents.mts'

function reconcilerOptions(name: keyof typeof AGENT_PRIORITY): JobOptions {
  return {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY[name],
  }
}

export const scheduledJobManifest = defineScheduledJobManifest(AI_AGENTS_QUEUE_NAME, [
  {
    schedulerId: 'reconcileAutoDispatchJudgements',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'reconcile-auto-dispatch-judgements',
      opts: () => reconcilerOptions('reconcile-auto-dispatch-judgements'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcileAutoDispatchJudgements',
        schedule: '*/5 * * * *',
        description: 'Re-enqueue undispatched AI moderation judgements (crash recovery)',
        trigger: enqueueReconcileAutoDispatchJudgements,
      },
    ],
  },
  {
    schedulerId: 'reconcileChatRuntimeGenerations',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'reconcile-chat-runtime-generations',
      data: {},
      opts: () => reconcilerOptions('reconcile-chat-runtime-generations'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcileChatRuntimeGenerations',
        schedule: '*/5 * * * *',
        description: 'Fail stale hosted-chat generations after an interrupted worker',
        trigger: enqueueReconcileChatRuntimeGenerations,
      },
    ],
  },
  {
    schedulerId: 'reconcileMemberSupportAgentIntents',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'reconcile-member-support-agent-intents',
      data: {},
      opts: () => reconcilerOptions('reconcile-member-support-agent-intents'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcileMemberSupportAgentIntents',
        schedule: '*/5 * * * *',
        description: 'Re-enqueue member-created support drafts after post-commit enqueue failures',
        trigger: enqueueReconcileMemberSupportAgentIntents,
      },
    ],
  },
  {
    schedulerId: 'reconcileBackgroundResponses',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'reconcile-background-responses',
      opts: () => reconcilerOptions('reconcile-background-responses'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcileBackgroundResponses',
        schedule: '*/5 * * * *',
        description: 'Cancel/retrieve/record orphaned OpenAI background responses (crash recovery)',
        trigger: enqueueReconcileBackgroundResponses,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(ai_agents, scheduledJobManifest)
}
