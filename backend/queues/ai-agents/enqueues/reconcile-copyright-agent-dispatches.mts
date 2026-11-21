import type { CopyrightAgentSweepData } from '../types.mts'
import type { JobOptions } from 'glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS } from '../config.mts'
import {
  COPYRIGHT_AGENT_DISPATCH_JOBS,
  COPYRIGHT_AGENT_DISPATCH_ORDERING,
  type CopyrightAgentDispatchStage,
} from './copyright-agent-dispatch-stages.mts'
import { createAIAgentEnqueue } from './create-enqueue.mts'

const enqueueStageJobs = {
  email: createAIAgentEnqueue(COPYRIGHT_AGENT_DISPATCH_JOBS.email.jobName),
  'form-screening': createAIAgentEnqueue(COPYRIGHT_AGENT_DISPATCH_JOBS['form-screening'].jobName),
  'form-effect': createAIAgentEnqueue(COPYRIGHT_AGENT_DISPATCH_JOBS['form-effect'].jobName),
  appeal: createAIAgentEnqueue(COPYRIGHT_AGENT_DISPATCH_JOBS.appeal.jobName),
  'submission-guidance': createAIAgentEnqueue(
    COPYRIGHT_AGENT_DISPATCH_JOBS['submission-guidance'].jobName,
  ),
} as const satisfies Record<CopyrightAgentDispatchStage, unknown>

/** Enqueues one stage's sweep; a continuation's dedup id carries its stage and cursor. */
export function enqueueReconcileCopyrightAgentDispatchStage(
  stage: CopyrightAgentDispatchStage,
  data: CopyrightAgentSweepData = {},
) {
  const { jobName } = COPYRIGHT_AGENT_DISPATCH_JOBS[stage]
  return enqueueStageJobs[stage](data, {
    ...AI_AGENTS_DEFAULTS,
    priority: AGENT_PRIORITY[jobName],
    ordering: COPYRIGHT_AGENT_DISPATCH_ORDERING,
    deduplication: {
      id: `copyright-agent-sweep:${stage}:${data.after ?? 'root'}`,
      mode: 'throttle',
      ttl: 60_000,
    },
  } satisfies JobOptions)
}
