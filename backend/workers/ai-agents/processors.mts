import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import type { AIAgentJobPayloads } from '@queues/ai-agents/types'
import { processAutotaggerRssFeedItem } from './processors/process-autotagger.mts'
import { processStoryPost } from './processors/process-story-post.mts'
import { processReportJudgement } from './processors/process-report-judgement.mts'
import { processDisputeResolution } from './processors/process-dispute-resolution.mts'
import { processAppealResolution } from './processors/process-appeal-resolution.mts'
import { processCopyrightEmailIntake } from './processors/process-copyright-email-intake.mts'
import { processCopyrightFormScreening } from './processors/process-copyright-form-screening.mts'
import { processCopyrightAppealRecommendation } from './processors/process-copyright-appeal-recommendation.mts'
import { processCopyrightSubmissionGuidance } from './processors/process-copyright-submission-guidance.mts'
import {
  processClassifierRun,
  processClassifierRunDispatcher,
} from './processors/process-classifier-run.mts'
import { processBackfillReportJudgements } from './processors/process-backfill-report-judgements.mts'
import { processAutoDispatchJudgement } from './processors/process-auto-dispatch-judgement.mts'
import { processReconcileAutoDispatchJudgements } from './processors/process-reconcile-auto-dispatch-judgements.mts'
import { processReconcileCopyrightAgentDispatches } from './processors/process-reconcile-copyright-agent-dispatches.mts'
import { processReconcileClassifierRuns } from './processors/process-reconcile-classifier-runs.mts'

type AIAgentJob = NamedQueueJob<AIAgentJobPayloads>

const processors = {
  'autotagger-rss-feed-item': processAutotaggerRssFeedItem,
  'classifier-run-dispatcher': processClassifierRunDispatcher,
  'classifier-run': processClassifierRun,
  'reconcile-classifier-runs': job => processReconcileClassifierRuns(job.data),
  'story-post': processStoryPost,
  'report-judgement': processReportJudgement,
  'dispute-resolution': processDisputeResolution,
  'appeal-resolution': processAppealResolution,
  'copyright-email-intake': processCopyrightEmailIntake,
  'copyright-form-screening': processCopyrightFormScreening,
  'copyright-appeal-recommendation': processCopyrightAppealRecommendation,
  'copyright-submission-guidance': processCopyrightSubmissionGuidance,
  backfill_report_judgements: processBackfillReportJudgements,
  'auto-dispatch-judgement': processAutoDispatchJudgement,
  'reconcile-auto-dispatch-judgements': processReconcileAutoDispatchJudgements,
  'recover-background-response': () => {
    throw new Error('Response recovery must settle before processor dispatch')
  },
  'reconcile-copyright-agent-dispatches': job => processReconcileCopyrightAgentDispatches(job.data),
} satisfies {
  [TName in keyof AIAgentJobPayloads]: (
    job: Extract<AIAgentJob, { name: TName }>,
  ) => Promise<unknown>
}

export function processAIAgent(job: AIAgentJob): Promise<unknown> {
  if (!Object.hasOwn(processors, job.name)) {
    throw new Error(`Unknown AI agent job: ${job.name}`)
  }
  // Each entry is checked against its name above; lookup loses that job/name correlation.
  const processor = processors[job.name] as (namedJob: AIAgentJob) => Promise<unknown>
  return processor(job)
}
