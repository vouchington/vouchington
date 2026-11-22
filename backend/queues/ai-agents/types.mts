export type AutotaggerRssFeedItemJobData = {
  rss_feed_item_id: string
}

/** Reserves the run of one requested subject, then enqueues it. Exactly one subject id is set. */
export type ClassifierRunDispatcherJobData = {
  classifier: string
  postId: string | null
  rssFeedItemId: string | null
}

/** Runs one reserved receipt; hashes are hex so the payload stays JSON-safe. */
export type ClassifierRunJobData = {
  classifier: string
  runId: string
  postId: string | null
  rssFeedItemId: string | null
  inputSha256: string
  configurationSha256: string
}

/**
 * One page of the recovery sweep. A scheduled tick carries no data and starts the incomplete-run
 * phase; each full page chains the next with its cursor, and the last incomplete page starts the
 * request phase for every classifier.
 */
export type ReconcileClassifierRunsJobData = {
  phase?: 'incomplete' | 'requests'
  classifier?: string
  after?: string | null
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
  run_id?: string | null
  context_hash?: string | null
}

export type DisputeResolutionJobData = {
  dispute_id: string
  /** Resolution run row id: the durable request identity. */
  run_id: string
  rerun_by_id?: string | null
}

export type AppealResolutionJobData = {
  appeal_id: string
  /** Resolution run row id: the durable request identity. */
  run_id: string
  rerun_by_id?: string | null
}

export type CopyrightEmailIntakeJobData = {
  intake_id: string
  run_id: string
}
export type CopyrightFormScreeningJobData = { submission_id: string }
export type CopyrightAppealRecommendationJobData = { submission_id: string; run_id: string }
export type CopyrightSubmissionGuidanceJobData = { submission_id: string; run_id: string }

export type BackfillReportJudgementsJobData = Record<string, never>

export type AutoDispatchJudgementJobData = {
  judgement_id: string
  entity_type: string
  entity_id: string
  community_id: string | null
}

export type SpendCapDelayedData = {
  spendCapDelayedDay?: string
}

/** Unsettled direct OpenAI responses owned by an AI worker job. */
export type JobBackgroundResponse = {
  responseId: string
  agentSlug: string
  communityId: string | null
  postId: string | null
  createdAt: string
}

export type BackgroundResponseJobData = {
  backgroundResponses?: JobBackgroundResponse[]
}

export type SpendCapRecheckJobData = {
  day: string
  generation: string
  cursor?: string
}

/** One stage's id cursor where its walk continues. */
export type CopyrightAgentSweepData = { after?: string }

type AIAgentJobPayloadsByName = {
  'autotagger-rss-feed-item': AutotaggerRssFeedItemJobData
  'classifier-run-dispatcher': ClassifierRunDispatcherJobData
  'classifier-run': ClassifierRunJobData
  'reconcile-classifier-runs': ReconcileClassifierRunsJobData
  'report-judgement': ReportJudgementJobData
  'dispute-resolution': DisputeResolutionJobData
  'appeal-resolution': AppealResolutionJobData
  'copyright-email-intake': CopyrightEmailIntakeJobData
  'copyright-form-screening': CopyrightFormScreeningJobData
  'copyright-appeal-recommendation': CopyrightAppealRecommendationJobData
  'copyright-submission-guidance': CopyrightSubmissionGuidanceJobData
  'story-post': StoryPostJobData
  backfill_report_judgements: BackfillReportJudgementsJobData
  'auto-dispatch-judgement': AutoDispatchJudgementJobData
  'reconcile-auto-dispatch-judgements': Record<string, never>
  'recover-background-response': BackgroundResponseJobData
  'reconcile-copyright-email-dispatches': CopyrightAgentSweepData
  'reconcile-copyright-form-screening-dispatches': CopyrightAgentSweepData
  'reconcile-copyright-form-effect-dispatches': CopyrightAgentSweepData
  'reconcile-copyright-appeal-dispatches': CopyrightAgentSweepData
  'reconcile-copyright-submission-guidance-dispatches': CopyrightAgentSweepData
  'expire-stuck-report-judgement-runs': Record<string, never>
  'expire-stuck-appeal-resolution-runs': Record<string, never>
  'expire-stuck-dispute-resolution-runs': Record<string, never>
}

/** Shared recovery/spend metadata is added by the worker after queue admission. */
export type AIAgentJobPayloads = {
  [TName in keyof AIAgentJobPayloadsByName]: AIAgentJobPayloadsByName[TName] &
    SpendCapDelayedData &
    BackgroundResponseJobData
}

export type AIAgentJobData = AIAgentJobPayloads[keyof AIAgentJobPayloads]
