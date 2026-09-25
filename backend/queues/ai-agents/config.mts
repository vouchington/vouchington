export const AI_AGENTS_QUEUE_NAME = 'ai_agents'
export const OPENAI_SPEND_CAP_RECHECKS_QUEUE_NAME = 'openai-spend-cap-rechecks'
export const OPENAI_SPEND_CAP_RECHECK_JOB_NAME = 'recheck' as const
export const AI_AGENTS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

export type AIAgentJobName =
  | 'chat'
  | 'autotagger-post'
  | 'autotagger-rss-feed-item'
  | 'moderation-dispatcher'
  | 'moderation-prompt'
  | 'community-moderation-dispatcher'
  | 'community-moderation-prompt'
  | 'customer-support'
  | 'report-judgement'
  | 'dispute-resolution'
  | 'appeal-resolution'
  | 'copyright-email-intake'
  | 'copyright-form-screening'
  | 'copyright-appeal-recommendation'
  | 'story-clustering'
  | 'story-post'
  | 'backfill_report_judgements'
  | 'auto-dispatch-judgement'
  | 'reconcile-auto-dispatch-judgements'
  | 'reconcile-background-responses'
  | 'reconcile-chat-runtime-generations'
  | 'reconcile-member-support-agent-intents'
  | 'reconcile-copyright-agent-dispatches'

export const AGENT_PRIORITY: Record<AIAgentJobName, number> = {
  chat: 1,
  'moderation-prompt': 3,
  'community-moderation-prompt': 3,
  'customer-support': 5,
  'moderation-dispatcher': 8,
  'community-moderation-dispatcher': 8,
  'report-judgement': 9,
  'dispute-resolution': 9,
  'appeal-resolution': 9,
  'copyright-email-intake': 9,
  'copyright-form-screening': 9,
  'copyright-appeal-recommendation': 9,
  'story-post': 10,
  'story-clustering': 15,
  'autotagger-post': 20,
  'autotagger-rss-feed-item': 20,
  backfill_report_judgements: 100,
  'auto-dispatch-judgement': 10,
  'reconcile-auto-dispatch-judgements': 100,
  'reconcile-background-responses': 100,
  'reconcile-chat-runtime-generations': 100,
  'reconcile-member-support-agent-intents': 100,
  'reconcile-copyright-agent-dispatches': 100,
}

// Which job types can incur billed OpenAI generation spend, and are therefore subject to the
// daily spend-ceiling check (#8773, `backend/workers/ai-agents/workers/core.mts`). The three
// `reconcile-*` job types only sweep/cancel/re-enqueue existing work -- none call OpenAI to
// generate new content -- so they must keep running through a cap breach. In particular,
// `reconcile-background-responses` cancels orphaned leases that are still billing OpenAI;
// blocking it on the spend cap would increase spend, not bound it. `auto-dispatch-judgement` is
// exempt for the same reason: it only applies an already-computed judgement (remove content, warn
// a user, escalate, resolve a report) -- it never calls OpenAI itself, and blocking it on the cap
// would leave harmful content live and reports unactioned. `moderation-dispatcher` is exempt for
// the same reason too: `processModerationDispatcher()` only computes which moderators still need
// to run and enqueues `moderation-prompt` jobs -- it never calls OpenAI itself. Gating the
// dispatcher would also block the spend-free `ai-generated` moderator (it runs the local
// `@jongleberry/vurst-ai` detector, not OpenAI) from ever being dispatched during a breach.
// `community-moderation-dispatcher` has no such spend-free moderator, so it stays gated -- every
// `community-moderation-prompt` job it can enqueue calls OpenAI. `chat` here is necessary but not
// sufficient: `core.mts`'s gate also excludes Anthropic-routed chat jobs
// (`job.data.modelProvider === 'anthropic'`), which never call OpenAI at all -- and
// `moderation-prompt` is likewise necessary but not sufficient: `core.mts`'s gate also excludes
// `moderatorSlug === AI_GENERATED_MODERATOR_SLUG` prompt jobs for the reason above.
// `autotagger-post` and `autotagger-rss-feed-item` (C6) dispatch through the classifier path
// (`@agents/autotagger/dispatch-classifier.mts`), which calls the seeded `tagging` classifier over
// OpenRouter/Noul, never OpenAI -- so neither is subject to this OpenAI daily spend ceiling at all;
// their Noul/OpenRouter spend is tracked and capped separately. `story-post` is necessary but not
// sufficient, the same shape as `chat`/`moderation-prompt` above: a non-force retry against a post
// that already has `ai_summary_markdown` set only re-persists the existing summary to re-trigger
// the downstream moderation/spam/embedding jobs (`updateStoryPostAgentResult`) -- it never calls
// `callStoryPostAgent`. Blocking that recovery path on the cap would delay it until midnight even
// though it cannot itself add to the day's spend. `core.mts`'s gate defers to
// `wouldStoryPostCallOpenAI` (`backend/workers/ai-agents/processors/process-story-post.mts`) for it.
export const AI_AGENT_JOB_PRODUCES_SPEND: Record<AIAgentJobName, boolean> = {
  chat: true,
  'moderation-prompt': true,
  'community-moderation-prompt': true,
  'customer-support': true,
  'moderation-dispatcher': false,
  'community-moderation-dispatcher': true,
  'report-judgement': true,
  'dispute-resolution': true,
  'appeal-resolution': true,
  'copyright-email-intake': true,
  'copyright-form-screening': true,
  'copyright-appeal-recommendation': true,
  'story-post': true,
  'story-clustering': true,
  'autotagger-post': false,
  'autotagger-rss-feed-item': false,
  backfill_report_judgements: true,
  'auto-dispatch-judgement': false,
  'reconcile-auto-dispatch-judgements': false,
  'reconcile-background-responses': false,
  'reconcile-chat-runtime-generations': false,
  'reconcile-member-support-agent-intents': false,
  'reconcile-copyright-agent-dispatches': false,
}
