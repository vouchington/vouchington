import type { Job } from 'glide-mq'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import type { AIAgentJobName } from '@queues/ai-agents/config'
import { processChat } from './processors/process-chat.mts'
import {
  processAutotaggerPost,
  processAutotaggerRssFeedItem,
} from './processors/process-autotagger.mts'
import {
  processModerationDispatcher,
  processModerationPrompt,
} from './processors/process-moderation.mts'
import {
  processCommunityModerationDispatcher,
  processCommunityModerationPrompt,
} from './processors/process-community-moderation.mts'
import { processCustomerSupport, processStoryClustering } from './processors/process-misc.mts'
import { processStoryPost } from './processors/process-story-post.mts'
import { processReportJudgement } from './processors/process-report-judgement.mts'
import { processDisputeResolution } from './processors/process-dispute-resolution.mts'
import { processAppealResolution } from './processors/process-appeal-resolution.mts'
import { processCopyrightEmailIntake } from './processors/process-copyright-email-intake.mts'
import { processCopyrightFormScreening } from './processors/process-copyright-form-screening.mts'
import { processCopyrightAppealRecommendation } from './processors/process-copyright-appeal-recommendation.mts'
import { processBackfillReportJudgements } from './processors/process-backfill-report-judgements.mts'
import { processAutoDispatchJudgement } from './processors/process-auto-dispatch-judgement.mts'
import { processReconcileAutoDispatchJudgements } from './processors/process-reconcile-auto-dispatch-judgements.mts'
import { processReconcileBackgroundResponses } from './processors/process-reconcile-background-responses.mts'
import { processReconcileChatRuntimeGenerations } from './processors/process-reconcile-chat-runtime-generations.mts'
import { processReconcileMemberSupportAgentIntents } from './processors/process-reconcile-member-support-agent-intents.mts'
import { processReconcileCopyrightAgentDispatches } from './processors/process-reconcile-copyright-agent-dispatches.mts'

export type ProcessAIAgentDependencies = {
  processReconcileChatRuntimeGenerations: typeof processReconcileChatRuntimeGenerations
}

const defaultProcessAIAgentDependencies: ProcessAIAgentDependencies = {
  processReconcileChatRuntimeGenerations,
}

export function processAIAgent(
  job: Job<AIAgentJobData>,
  dependencyOverrides: Partial<ProcessAIAgentDependencies> = {},
): Promise<unknown> {
  const dependencies = { ...defaultProcessAIAgentDependencies, ...dependencyOverrides }
  const name = job.name as AIAgentJobName

  switch (name) {
    case 'chat':
      return processChat(job as Job<import('@queues/ai-agents/types').ChatJobData>)
    case 'autotagger-post':
      return processAutotaggerPost(
        job as Job<import('@queues/ai-agents/types').AutotaggerPostJobData>,
      )
    case 'autotagger-rss-feed-item':
      return processAutotaggerRssFeedItem(
        job as Job<import('@queues/ai-agents/types').AutotaggerRssFeedItemJobData>,
      )
    case 'moderation-dispatcher':
      return processModerationDispatcher(
        job as Job<import('@queues/ai-agents/types').ModerationDispatcherJobData>,
      )
    case 'moderation-prompt':
      return processModerationPrompt(
        job as Job<import('@queues/ai-agents/types').ModerationPromptJobData>,
      )
    case 'community-moderation-dispatcher':
      return processCommunityModerationDispatcher(
        job as Job<import('@queues/ai-agents/types').CommunityModerationDispatcherJobData>,
      )
    case 'community-moderation-prompt':
      return processCommunityModerationPrompt(
        job as Job<import('@queues/ai-agents/types').CommunityModerationPromptJobData>,
      )
    case 'customer-support':
      return processCustomerSupport(
        job as Job<import('@queues/ai-agents/types').CustomerSupportJobData>,
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
    case 'reconcile-chat-runtime-generations':
      return dependencies.processReconcileChatRuntimeGenerations()
    case 'reconcile-member-support-agent-intents':
      return processReconcileMemberSupportAgentIntents()
    case 'reconcile-copyright-agent-dispatches':
      return processReconcileCopyrightAgentDispatches()
    default:
      name satisfies never
      throw new Error(`Unknown AI agent job: ${name}`)
  }
}
