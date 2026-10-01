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
  | 'autotagger-rss-feed-item'
  | 'classifier-run-dispatcher'
  | 'classifier-run'
  | 'reconcile-classifier-runs'
  | 'community-moderation-dispatcher'
  | 'community-moderation-prompt'
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
  | 'reconcile-copyright-agent-dispatches'

export const AGENT_PRIORITY: Record<AIAgentJobName, number> = {
  'community-moderation-prompt': 3,
  'classifier-run-dispatcher': 8,
  'classifier-run': 3,
  'reconcile-classifier-runs': 100,
  'community-moderation-dispatcher': 8,
  'report-judgement': 9,
  'dispute-resolution': 9,
  'appeal-resolution': 9,
  'copyright-email-intake': 9,
  'copyright-form-screening': 9,
  'copyright-appeal-recommendation': 9,
  'story-post': 10,
  'story-clustering': 15,
  'autotagger-rss-feed-item': 20,
  backfill_report_judgements: 100,
  'auto-dispatch-judgement': 10,
  'reconcile-auto-dispatch-judgements': 100,
  'reconcile-background-responses': 100,
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
// would leave harmful content live and reports unactioned. `community-moderation-dispatcher`
// stays gated: every `community-moderation-prompt` job it can enqueue calls OpenAI.
// `autotagger-rss-feed-item` only runs the collaborative-follower pass, which reads follow and vote
// relations and never calls a model, so it is spend-free. C6's model call is the shared
// `classifier-run` job, whose structured-decision client performs the authoritative pre-call cap
// check and records the spend (see `classifier-run` below). `story-post`
// is necessary but not sufficient: a non-force retry against a post
// that already has `ai_summary_markdown` set only re-persists the existing summary to re-trigger
// the downstream moderation/spam/embedding jobs (`updateStoryPostAgentResult`) -- it never calls
// `callStoryPostAgent`. Blocking that recovery path on the cap would delay it until midnight even
// though it cannot itself add to the day's spend. `core.mts`'s gate defers to
// `wouldStoryPostCallOpenAI` (`backend/workers/ai-agents/processors/process-story-post.mts`) for it.
export const AI_AGENT_JOB_PRODUCES_SPEND: Record<AIAgentJobName, boolean> = {
  'community-moderation-prompt': true,
  // The dispatcher only reserves durable intent. The run job can finish local-only/effect replay
  // without provider spend; its structured-decision client performs the authoritative pre-call cap
  // check. The reconciler stops itself on a breach and never calls a provider.
  'classifier-run-dispatcher': false,
  'classifier-run': false,
  'reconcile-classifier-runs': false,
  'community-moderation-dispatcher': true,
  'report-judgement': true,
  'dispute-resolution': true,
  'appeal-resolution': true,
  'copyright-email-intake': true,
  'copyright-form-screening': true,
  'copyright-appeal-recommendation': true,
  'story-post': true,
  'story-clustering': true,
  'autotagger-rss-feed-item': false,
  backfill_report_judgements: true,
  'auto-dispatch-judgement': false,
  'reconcile-auto-dispatch-judgements': false,
  'reconcile-background-responses': false,
  'reconcile-copyright-agent-dispatches': false,
}
