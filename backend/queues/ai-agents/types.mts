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

export type CopyrightEmailIntakeJobData = {
  intake_id: string
}
export type CopyrightFormScreeningJobData = { submission_id: string }
export type CopyrightAppealRecommendationJobData = { submission_id: string }
export type CopyrightSubmissionGuidanceJobData = { submission_id: string }

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

export type SpendCapRecheckJobData = {
  day: string
  generation: string
  cursor?: string
}

export type AIAgentJobData = (
  | CopyrightAgentSweepData
  | AutotaggerRssFeedItemJobData
  | ClassifierRunDispatcherJobData
  | ClassifierRunJobData
  | ReportJudgementJobData
  | DisputeResolutionJobData
  | AppealResolutionJobData
  | CopyrightEmailIntakeJobData
  | CopyrightFormScreeningJobData
  | CopyrightAppealRecommendationJobData
  | CopyrightSubmissionGuidanceJobData
  | StoryPostJobData
  | BackfillReportJudgementsJobData
  | ReconcileClassifierRunsJobData
  | AutoDispatchJudgementJobData
) &
  SpendCapDelayedData

export type CopyrightAgentSweepData = { after?: string }
