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

export function processAIAgent(job: NamedQueueJob<AIAgentJobPayloads>): Promise<unknown> {
  const jobName: string = job.name
  switch (job.name) {
    case 'autotagger-rss-feed-item':
      return processAutotaggerRssFeedItem(job)
    case 'classifier-run-dispatcher':
      return processClassifierRunDispatcher(job)
    case 'classifier-run':
      return processClassifierRun(job)
    case 'reconcile-classifier-runs':
      return processReconcileClassifierRuns(job.data)
    case 'story-post':
      return processStoryPost(job)
    case 'report-judgement':
      return processReportJudgement(job)
    case 'dispute-resolution':
      return processDisputeResolution(job)
    case 'appeal-resolution':
      return processAppealResolution(job)
    case 'copyright-email-intake':
      return processCopyrightEmailIntake(job)
    case 'copyright-form-screening':
      return processCopyrightFormScreening(job)
    case 'copyright-appeal-recommendation':
      return processCopyrightAppealRecommendation(job)
    case 'copyright-submission-guidance':
      return processCopyrightSubmissionGuidance(job)
    case 'backfill_report_judgements':
      return processBackfillReportJudgements()
    case 'auto-dispatch-judgement':
      return processAutoDispatchJudgement(job)
    case 'reconcile-auto-dispatch-judgements':
      return processReconcileAutoDispatchJudgements()
    case 'recover-background-response':
      throw new Error('Response recovery must settle before processor dispatch')
    case 'reconcile-copyright-agent-dispatches':
      return processReconcileCopyrightAgentDispatches(job.data)
    default:
      throw new Error(`Unknown AI agent job: ${jobName}`)
  }
}
