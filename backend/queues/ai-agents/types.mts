import type { AgentModelProvider } from '@voucha/types/entities/agent-model'

type HostedChatModelProvider = Extract<AgentModelProvider, 'openai' | 'anthropic'>

export type ChatJobData = {
  conversationId: string
  conversationMessageId: string
  userMessageId: string
  userMessage: string
  userId: string
  modelProvider?: HostedChatModelProvider
}

export type AutotaggerPostJobData = {
  id: string
}

export type AutotaggerRssFeedItemJobData = {
  rss_feed_item_id: string
  embedding_retries?: number
}

export type ModerationDispatcherJobData = {
  id: string
}

export type ModerationPromptJobData = {
  id: string
  moderatorSlug: string
  source?: 'baseline' | 'community'
}

export type CommunityModerationDispatcherJobData = {
  postId: string
  communityId: string
}

export type CommunityModerationPromptJobData = {
  postId: string
  communityId: string
  promptId: string
}

export type CustomerSupportJobData =
  | {
      threadId: string
      idempotencyKey?: never
      supportMessageId?: never
    }
  | {
      threadId: string
      idempotencyKey: string
      supportMessageId: string
    }

export type StoryClusteringJobData = {
  rss_feed_item_id: string
  embedding_retries?: number
}

export type StoryPostJobData = {
  post_id: string
  /** When true, re-summarize even if ai_summary_markdown is already set (used by story refresh). */
  force?: boolean
}

export type ReportJudgementJobData = {
  entity_type: string
  entity_id: string
  triggering_report_id: string
  rerun_by_id?: string | null
  context_hash?: string | null
}

export type DisputeResolutionJobData = {
  dispute_id: string
  rerun_by_id?: string | null
}

export type AppealResolutionJobData = {
  appeal_id: string
  rerun_by_id?: string | null
}

export type BackfillReportJudgementsJobData = Record<string, never>

export type AutoDispatchJudgementJobData = {
  judgement_id: string
  entity_type: string
  entity_id: string
  community_id: string | null
}

export type OpenAiSpendCapDelayedData = {
  openAiSpendCapDelayedDay?: string
}

export type OpenAiSpendCapRecheckJobData = {
  day: string
  generation: string
  cursor?: string
}

export type AIAgentJobData = (
  | ChatJobData
  | AutotaggerPostJobData
  | AutotaggerRssFeedItemJobData
  | ModerationDispatcherJobData
  | ModerationPromptJobData
  | CommunityModerationDispatcherJobData
  | CommunityModerationPromptJobData
  | CustomerSupportJobData
  | ReportJudgementJobData
  | DisputeResolutionJobData
  | AppealResolutionJobData
  | StoryClusteringJobData
  | StoryPostJobData
  | BackfillReportJudgementsJobData
  | AutoDispatchJudgementJobData
) &
  OpenAiSpendCapDelayedData
