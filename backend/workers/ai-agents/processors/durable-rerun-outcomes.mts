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

type AgentJob = NamedQueueJob<AIAgentJobPayloads>

/** Persist exhaustion before GlideMQ can retire the failed job. Deferrals are still active. */
export async function withDurableRerunOutcome(
  job: AgentJob,
  process: () => Promise<unknown>,
): Promise<unknown> {
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
      if (job.name === 'report-judgement' && job.data.rerun_by_id && job.data.run_id) {
        await markReportJudgementRunFailed(job.data.triggering_report_id, job.data.run_id)
      } else if (job.name === 'appeal-resolution' && job.data.rerun_by_id) {
        await markAppealResolutionRunFailed(job.data.appeal_id, job.data.ai_draft_request_token)
      }
    }
    throw err
  }
}
