/** The longest window one report may cover. Keeps the batch scan inside one bounded id range. */
export const CLASSIFIER_COMPARISON_MAX_WINDOW_DAYS = 31

/** The most decision batches one report reads, newest first; a larger window reports `truncated`. */
export const CLASSIFIER_COMPARISON_MAX_BATCHES = 1000

/** Probability buckets are tenths: bucket 0 is [0, 0.1) and the last bucket is [0.9, 1]. */
export const CLASSIFIER_COMPARISON_BUCKET_COUNT = 10

/**
 * A cell publishes its human breakdown only when at least this many distinct humans voted on its
 * decisions. Counting decisions instead would let one voter's ballot on a single item, repeated by
 * every re-classification of it, pass as a cohort and disclose that ballot through an aggregate.
 */
export const CLASSIFIER_COMPARISON_MIN_HUMAN_COHORT = 20

export type ClassifierComparisonVote = -1 | 0 | 1

/** The humans' collective outcome on one decision's relation: the sign of their summed ballots. */
export type ClassifierHumanOutcome = 'up' | 'down' | 'neutral'

export type ClassifierHumanVoteComparisonOptions = {
  classifierId: string
  /** Inclusive window start, compared with the batch's creation time. */
  from: Date
  /** Exclusive window end. */
  to: Date
  /** Only decisions evaluated under this community's scope; omitted means every scope. */
  communityId?: string
  /** Only decisions made for this post. At most one of `postId` and `rssFeedItemId`. */
  postId?: string
  /** Only decisions made for this RSS feed item. */
  rssFeedItemId?: string
}

export type ClassifierComparisonRange = { min: number; max: number }

export type ClassifierComparisonCell = {
  probability_lower: number
  probability_upper: number
  /** What the stored effective thresholds made of the probability, before any human voted. */
  classifier_vote: ClassifierComparisonVote
  decisions: number
  mean_probability: number
  effective_lower_threshold: ClassifierComparisonRange
  effective_upper_threshold: ClassifierComparisonRange
  /** Decisions whose relation has at least one current human ballot. */
  human_decisions: number
  /** Distinct humans whose ballots those decisions count. */
  human_voters: number
  /** Null while `human_voters` is below the minimum cohort. Never lists voters or ballots. */
  human: Record<ClassifierHumanOutcome, number> | null
}

export type ClassifierHumanVoteComparison = {
  classifier_id: string
  window: { from: string; to: string }
  community_id: string | null
  post_id: string | null
  rss_feed_item_id: string | null
  batches_examined: number
  /** True when the window held more batches than the cap, so only the newest were examined. */
  truncated: boolean
  min_human_cohort: number
  cells: ClassifierComparisonCell[]
}

export type ClassifierHumanVoteComparisonResult =
  | { outcome: 'ok'; comparison: ClassifierHumanVoteComparison }
  | { outcome: 'not_found' }
  | { outcome: 'invalid'; reason: string }
  | { outcome: 'unsupported'; reason: string }
