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
import { copyrightExpiryScheduledJobs } from './schedules-copyright-expiry.mts'
import { enqueueReconcileAutoDispatchJudgements } from './reconcile-auto-dispatch.mts'
import { enqueueReconcileCopyrightAgentDispatchStage } from './reconcile-copyright-agent-dispatches.mts'
import { enqueueReconcileClassifierRuns } from './reconcile-classifier-runs.mts'
import {
  enqueueExpireStuckAppealResolutionRuns,
  enqueueExpireStuckDisputeResolutionRuns,
  enqueueExpireStuckReportJudgementRuns,
} from './expire-stuck-resolution-runs.mts'

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
  {
    schedulerId: 'expireStuckReportJudgementRuns',
    repeat: { pattern: '37 * * * *' },
    template: {
      name: 'expire-stuck-report-judgement-runs',
      data: {},
      opts: () => reconcilerOptions('expire-stuck-report-judgement-runs'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'expireStuckReportJudgementRuns',
        schedule: '37 * * * *',
        description: 'Expire report judgement runs left active after a crash or terminal stall',
        trigger: enqueueExpireStuckReportJudgementRuns,
      },
    ],
  },
  ...copyrightExpiryScheduledJobs,
  {
    schedulerId: 'expireStuckAppealResolutionRuns',
    repeat: { pattern: '17 * * * *' },
    template: {
      name: 'expire-stuck-appeal-resolution-runs',
      data: {},
      opts: () => reconcilerOptions('expire-stuck-appeal-resolution-runs'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'expireStuckAppealResolutionRuns',
        schedule: '17 * * * *',
        description: 'Expire appeal AI resolution runs left active after a failed queue admission',
        trigger: enqueueExpireStuckAppealResolutionRuns,
      },
    ],
  },
  {
    schedulerId: 'expireStuckDisputeResolutionRuns',
    repeat: { pattern: '47 * * * *' },
    template: {
      name: 'expire-stuck-dispute-resolution-runs',
      data: {},
      opts: () => reconcilerOptions('expire-stuck-dispute-resolution-runs'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'expireStuckDisputeResolutionRuns',
        schedule: '47 * * * *',
        description: 'Expire dispute AI resolution runs left active after a failed queue admission',
        trigger: enqueueExpireStuckDisputeResolutionRuns,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(ai_agents, scheduledJobManifest)
}
