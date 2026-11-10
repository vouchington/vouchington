import {
  DelayedError,
  GroupRateLimitError,
  SuspendError,
  WaitingChildrenError,
  Worker,
  UnrecoverableError,
} from 'glide-mq'
import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import type { AIAgentJobPayloads } from '@queues/ai-agents/types'
import { markReportJudgementRunFailed } from '@services/moderation-reports/rerun-outcomes'
import { markAppealResolutionRunFailed } from '@services/moderation-appeals/rerun-outcomes'
import onError from '@modules/on-error'

type AgentJob = NamedQueueJob<AIAgentJobPayloads>
type PersistFailure = (job: AgentJob) => Promise<void>

const TERMINAL_MARKER_STEP = 'persist-moderation-rerun-terminal-failure'
const TERMINAL_MARKER_RETRY_MS = 60_000

/** Persist exhaustion before GlideMQ can retire the failed job. Deferrals are still active. */
export async function withDurableRerunOutcome(
  job: AgentJob,
  process: () => Promise<unknown>,
  persistFailure: PersistFailure = persistTerminalFailure,
): Promise<unknown> {
  // GlideMQ persists the step with the delayed transition. A resumed final attempt must only
  // retry its database marker; running the agent here could repeat a paid provider call.
  if ('step' in job.data && job.data.step === TERMINAL_MARKER_STEP) {
    await persistOrDelay(job, persistFailure)
    return undefined
  }
  try {
    return await process()
  } catch (err) {
    if (
      err instanceof DelayedError ||
      err instanceof Worker.RateLimitError ||
      err instanceof GroupRateLimitError ||
      err instanceof SuspendError ||
      err instanceof WaitingChildrenError
    )
      throw err
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
    if (err instanceof UnrecoverableError || finalAttempt) {
      await persistOrDelay(job, persistFailure)
    }
    throw err
  }
}

async function persistOrDelay(job: AgentJob, persistFailure: PersistFailure): Promise<void> {
  try {
    await persistFailure(job)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err), { cause: err }))
    await job.moveToDelayed(Date.now() + TERMINAL_MARKER_RETRY_MS, TERMINAL_MARKER_STEP)
  }
}

async function persistTerminalFailure(job: AgentJob): Promise<void> {
  if (job.name === 'report-judgement' && job.data.rerun_by_id && job.data.run_id) {
    await markReportJudgementRunFailed(job.data.triggering_report_id, job.data.run_id)
  } else if (job.name === 'appeal-resolution' && job.data.rerun_by_id) {
    await markAppealResolutionRunFailed(job.data.appeal_id, job.data.ai_draft_request_token)
  }
}
