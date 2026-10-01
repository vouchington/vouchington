import type { Job } from 'glide-mq'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import type { AIAgentJobName } from '@queues/ai-agents/config'
import {
  processAutotaggerPost,
  processAutotaggerRssFeedItem,
} from './processors/process-autotagger.mts'
import {
  processCommunityModerationDispatcher,
  processCommunityModerationPrompt,
} from './processors/process-community-moderation.mts'
import { processStoryClustering } from './processors/process-misc.mts'
import { processStoryPost } from './processors/process-story-post.mts'
import { processReportJudgement } from './processors/process-report-judgement.mts'
import { processDisputeResolution } from './processors/process-dispute-resolution.mts'
import { processAppealResolution } from './processors/process-appeal-resolution.mts'
import { processCopyrightEmailIntake } from './processors/process-copyright-email-intake.mts'
import { processCopyrightFormScreening } from './processors/process-copyright-form-screening.mts'
import { processCopyrightAppealRecommendation } from './processors/process-copyright-appeal-recommendation.mts'
import {
  processClassifierRun,
  processClassifierRunDispatcher,
} from './processors/process-classifier-run.mts'
import { processBackfillReportJudgements } from './processors/process-backfill-report-judgements.mts'
import { processAutoDispatchJudgement } from './processors/process-auto-dispatch-judgement.mts'
import { processReconcileAutoDispatchJudgements } from './processors/process-reconcile-auto-dispatch-judgements.mts'
import { processReconcileBackgroundResponses } from './processors/process-reconcile-background-responses.mts'
import { processReconcileCopyrightAgentDispatches } from './processors/process-reconcile-copyright-agent-dispatches.mts'
import { processReconcileClassifierRuns } from './processors/process-reconcile-classifier-runs.mts'

export function processAIAgent(job: Job<AIAgentJobData>): Promise<unknown> {
  const name = job.name as AIAgentJobName

  switch (name) {
    case 'autotagger-post':
      return processAutotaggerPost(
        job as Job<import('@queues/ai-agents/types').AutotaggerPostJobData>,
      )
    case 'autotagger-rss-feed-item':
      return processAutotaggerRssFeedItem(
        job as Job<import('@queues/ai-agents/types').AutotaggerRssFeedItemJobData>,
      )
    case 'classifier-run-dispatcher':
      return processClassifierRunDispatcher(
        job as Job<import('@queues/ai-agents/types').ClassifierRunDispatcherJobData>,
      )
    case 'classifier-run':
      return processClassifierRun(
        job as Job<import('@queues/ai-agents/types').ClassifierRunJobData>,
      )
    case 'reconcile-classifier-runs':
      return processReconcileClassifierRuns(
        job.data as import('@queues/ai-agents/types').ReconcileClassifierRunsJobData,
      )
    case 'community-moderation-dispatcher':
      return processCommunityModerationDispatcher(
        job as Job<import('@queues/ai-agents/types').CommunityModerationDispatcherJobData>,
      )
    case 'community-moderation-prompt':
      return processCommunityModerationPrompt(
        job as Job<import('@queues/ai-agents/types').CommunityModerationPromptJobData>,
      )
    case 'story-clustering':
      return processStoryClustering(
        job as Job<import('@queues/ai-agents/types').StoryClusteringJobData>,
      )
    case 'story-post':
      return processStoryPost(job as Job<import('@queues/ai-agents/types').StoryPostJobData>)
    case 'report-judgement':
      return processReportJudgement(
        job as Job<import('@queues/ai-agents/types').ReportJudgementJobData>,
      )
    case 'dispute-resolution':
      return processDisputeResolution(
        job as Job<import('@queues/ai-agents/types').DisputeResolutionJobData>,
      )
    case 'appeal-resolution':
      return processAppealResolution(
        job as Job<import('@queues/ai-agents/types').AppealResolutionJobData>,
      )
    case 'copyright-email-intake':
      return processCopyrightEmailIntake(
        job as Job<import('@queues/ai-agents/types').CopyrightEmailIntakeJobData>,
      )
    case 'copyright-form-screening':
      return processCopyrightFormScreening(
        job as Job<import('@queues/ai-agents/types').CopyrightFormScreeningJobData>,
      )
    case 'copyright-appeal-recommendation':
      return processCopyrightAppealRecommendation(
        job as Job<import('@queues/ai-agents/types').CopyrightAppealRecommendationJobData>,
      )
    case 'backfill_report_judgements':
      return processBackfillReportJudgements()
    case 'auto-dispatch-judgement':
      return processAutoDispatchJudgement(
        job as Job<import('@queues/ai-agents/types').AutoDispatchJudgementJobData>,
      )
    case 'reconcile-auto-dispatch-judgements':
      return processReconcileAutoDispatchJudgements()
    case 'reconcile-background-responses':
      return processReconcileBackgroundResponses()
    case 'reconcile-copyright-agent-dispatches':
      return processReconcileCopyrightAgentDispatches()
    default:
      name satisfies never
      throw new Error(`Unknown AI agent job: ${name}`)
  }
}
