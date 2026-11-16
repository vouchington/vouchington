import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import {
  COPYRIGHT_AGENT_DISPATCH_JOBS,
  COPYRIGHT_AGENT_DISPATCH_ORDERING,
  COPYRIGHT_AGENT_DISPATCH_STAGES,
} from './copyright-agent-dispatch-stages.mts'
import { ai_agents } from '../queues.mts'
import { enqueueReconcileAutoDispatchJudgements } from './reconcile-auto-dispatch.mts'
import { enqueueReconcileCopyrightAgentDispatchStage } from './reconcile-copyright-agent-dispatches.mts'
import { enqueueReconcileClassifierRuns } from './reconcile-classifier-runs.mts'
import { enqueueReconcileAIAgentFailures } from './reconcile-ai-agent-failures.mts'

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
    schedulerId: 'reconcileAIAgentFailures',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'reconcile-ai-agent-failures',
      data: {},
      opts: () => reconcilerOptions('reconcile-ai-agent-failures'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcileAIAgentFailures',
        schedule: '*/5 * * * *',
        description: 'Persist failed manual AI reruns and bound ordinary failed-job history',
        trigger: enqueueReconcileAIAgentFailures,
      },
    ],
  },
  {
    schedulerId: 'reconcileClassifierRuns',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'reconcile-classifier-runs',
      data: {},
      opts: () => reconcilerOptions('reconcile-classifier-runs'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcileClassifierRuns',
        schedule: '*/5 * * * *',
        description: 'Re-enqueue incomplete classifier runs and dispatch unreserved requests',
        trigger: enqueueReconcileClassifierRuns,
      },
    ],
  },
  ...COPYRIGHT_AGENT_DISPATCH_STAGES.map(stage => {
    const { jobName, schedulerId, description } = COPYRIGHT_AGENT_DISPATCH_JOBS[stage]
    return {
      schedulerId,
      repeat: { pattern: '*/5 * * * *' },
      template: {
        name: jobName,
        data: {},
        opts: () => ({
          ...reconcilerOptions(jobName),
          ordering: COPYRIGHT_AGENT_DISPATCH_ORDERING,
        }),
      },
      operatorSurfaces: [
        {
          kind: 'scheduled-jobs',
          id: schedulerId,
          schedule: '*/5 * * * *',
          description,
          trigger: () => enqueueReconcileCopyrightAgentDispatchStage(stage),
        },
      ] as const,
    }
  }),
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
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(ai_agents, scheduledJobManifest)
  await enqueueReconcileAIAgentFailures()
}
