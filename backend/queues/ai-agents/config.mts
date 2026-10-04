export const AI_AGENTS_QUEUE_NAME = 'ai_agents'
export const SPEND_CAP_RECHECKS_QUEUE_NAME = 'ai-spend-cap-rechecks'
export const SPEND_CAP_RECHECK_JOB_NAME = 'recheck' as const
export const AI_AGENTS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

/**
 * A `classifier-run` job rides out a provider outage of minutes (#689), which the shared defaults
 * above (3 attempts, about 3 seconds) cannot. Only this job uses it; every other ai-agents queue
 * keeps `AI_AGENTS_DEFAULTS`.
 *
 * One number caps both the queue and the receipt: the job's `attempts` and the executor's
 * `maxAttempts` are both `CLASSIFIER_RUN_ATTEMPTS`, so a retry can never reserve a provider attempt
 * the receipt would refuse, and the recovery sweep can never buy an attempt beyond it. The backoff
 * is `delay * 2^(n-1)` for the nth retry, so the 7 waits are 30s, 1m, 2m, 4m, 8m, 16m, 32m: about
 * 63.5 minutes before jitter (up to about 79 with it). `classifierRunBackoffMs` also honours a
 * provider `Retry-After` up to `CLASSIFIER_RUN_RETRY_AFTER_CEILING_MS`.
 */
export const CLASSIFIER_RUN_ATTEMPTS = 8
export const CLASSIFIER_RUN_BACKOFF = {
  type: 'classifier-run-outage' as const,
  delay: 30_000,
  jitter: 0.25,
}
export const CLASSIFIER_RUN_RETRY_AFTER_CEILING_MS = 10 * 60_000

export type AIAgentJobName =
  | 'autotagger-rss-feed-item'
  | 'classifier-run-dispatcher'
  | 'classifier-run'
  | 'reconcile-classifier-runs'
  | 'report-judgement'
  | 'dispute-resolution'
  | 'appeal-resolution'
  | 'copyright-email-intake'
  | 'copyright-form-screening'
  | 'copyright-appeal-recommendation'
  | 'copyright-submission-guidance'
  | 'story-post'
  | 'backfill_report_judgements'
  | 'auto-dispatch-judgement'
  | 'reconcile-auto-dispatch-judgements'
  | 'reconcile-background-responses'
  | 'reconcile-copyright-agent-dispatches'

export const AGENT_PRIORITY: Record<AIAgentJobName, number> = {
  'classifier-run-dispatcher': 8,
  'classifier-run': 3,
  'reconcile-classifier-runs': 100,
  'report-judgement': 9,
  'dispute-resolution': 9,
  'appeal-resolution': 9,
  'copyright-email-intake': 9,
  'copyright-form-screening': 9,
  'copyright-appeal-recommendation': 9,
  'copyright-submission-guidance': 9,
  'story-post': 10,
  'autotagger-rss-feed-item': 20,
  backfill_report_judgements: 100,
  'auto-dispatch-judgement': 10,
  'reconcile-auto-dispatch-judgements': 100,
  'reconcile-background-responses': 100,
  'reconcile-copyright-agent-dispatches': 100,
}

// Which job types can incur billed provider generation spend, and are therefore subject to the
// daily spend-ceiling check (#8773, `backend/workers/ai-agents/workers/core.mts`). The three
// `reconcile-*` job types only sweep/cancel/re-enqueue existing work -- none call OpenAI to
// generate new content -- so they must keep running through a cap breach. In particular,
// `reconcile-background-responses` cancels orphaned leases that are still billing OpenAI;
// blocking it on the spend cap would increase spend, not bound it. `auto-dispatch-judgement` is
// exempt for the same reason: it only applies an already-computed judgement (remove content, warn
// a user, escalate, resolve a report) -- it never calls a model itself, and blocking it on the cap
// would leave harmful content live and reports unactioned.
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
  // The dispatcher only reserves durable intent. The run job can finish local-only/effect replay
  // without provider spend; its structured-decision client performs the authoritative pre-call cap
  // check. The reconciler stops itself on a breach and never calls a provider.
  'classifier-run-dispatcher': false,
  'classifier-run': false,
  'reconcile-classifier-runs': false,
  'report-judgement': true,
  'dispute-resolution': true,
  'appeal-resolution': true,
  'copyright-email-intake': true,
  'copyright-form-screening': true,
  'copyright-appeal-recommendation': true,
  'copyright-submission-guidance': true,
  'story-post': true,
  'autotagger-rss-feed-item': false,
  backfill_report_judgements: true,
  'auto-dispatch-judgement': false,
  'reconcile-auto-dispatch-judgements': false,
  'reconcile-background-responses': false,
  'reconcile-copyright-agent-dispatches': false,
}
