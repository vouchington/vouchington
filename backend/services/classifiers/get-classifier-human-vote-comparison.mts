import { getClassifiersWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import {
  buildHumanVoteComparisonQuery,
  comparisonCellRows,
  type ComparisonQueryRow,
  type ComparisonRow,
} from './human-vote-comparison-query.mts'
import {
  CLASSIFIER_COMPARISON_BUCKET_COUNT,
  CLASSIFIER_COMPARISON_MAX_WINDOW_DAYS,
  CLASSIFIER_COMPARISON_MIN_HUMAN_COHORT,
  type ClassifierComparisonCell,
  type ClassifierComparisonVote,
  type ClassifierHumanOutcome,
  type ClassifierHumanVoteComparisonOptions,
  type ClassifierHumanVoteComparisonResult,
} from './human-vote-comparison-types.mts'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Compares a topic classifier's stored probabilities and effective thresholds with what humans
 * later voted on the same subject-topic relations. The report is read-only and aggregate: cells of
 * probability tenths by classifier vote, each carrying counts of human outcomes and never a
 * voter, a ballot or any content. See `buildHumanVoteComparisonQuery` for how the scan is bounded.
 */
export async function getClassifierHumanVoteComparison(
  options: ClassifierHumanVoteComparisonOptions,
): Promise<ClassifierHumanVoteComparisonResult> {
  const CLASSIFIER_COMPARISON_MAX_BATCHES = getClassifiersWorkLimit('comparison_max_batches')
  const invalid = validateWindowAndItem(options)
  if (invalid) return { outcome: 'invalid', reason: invalid }
  const { rows: classifiers } = await read<{ candidate_kind: string }>(
    `/* classifierHumanVoteComparison:classifier */
    SELECT candidate_kind FROM classifiers WHERE id = $1 AND deleted_at IS NULL`,
    [options.classifierId],
  )
  if (!classifiers[0]) return { outcome: 'not_found' }
  if (classifiers[0].candidate_kind !== 'topic') {
    return {
      outcome: 'unsupported',
      reason: 'Only topic classifiers can be compared with human topic votes',
    }
  }
  const query = buildHumanVoteComparisonQuery(options, CLASSIFIER_COMPARISON_MAX_BATCHES)
  const { rows } = await read<ComparisonQueryRow>(query.text, query.values)
  const batchesSelected = rows[0]?.batches_selected ?? 0
  return {
    outcome: 'ok',
    comparison: {
      classifier_id: options.classifierId,
      window: { from: options.from.toISOString(), to: options.to.toISOString() },
      community_id: options.communityId ?? null,
      post_id: options.postId ?? null,
      rss_feed_item_id: options.rssFeedItemId ?? null,
      batches_examined: Math.min(batchesSelected, CLASSIFIER_COMPARISON_MAX_BATCHES),
      truncated: batchesSelected > CLASSIFIER_COMPARISON_MAX_BATCHES,
      min_human_cohort: CLASSIFIER_COMPARISON_MIN_HUMAN_COHORT,
      cells: toCells(comparisonCellRows(rows)),
    },
  }
}

function validateWindowAndItem(options: ClassifierHumanVoteComparisonOptions): string | null {
  const span = options.to.getTime() - options.from.getTime()
  if (!(span > 0)) return 'The window must end after it starts'
  if (span > CLASSIFIER_COMPARISON_MAX_WINDOW_DAYS * DAY_MS) {
    return `The window cannot exceed ${CLASSIFIER_COMPARISON_MAX_WINDOW_DAYS} days`
  }
  if (options.postId !== undefined && options.rssFeedItemId !== undefined) {
    return 'Filter by a post or an RSS feed item, not both'
  }
  return null
}

type CellDraft = Omit<ClassifierComparisonCell, 'human' | 'mean_probability'> & {
  probability_sum: number
  outcomes: Record<ClassifierHumanOutcome, number>
}

/** Folds the per-human-outcome rows into cells and withholds human counts from small cohorts. */
function toCells(rows: readonly ComparisonRow[]): ClassifierComparisonCell[] {
  const drafts = new Map<string, CellDraft>()
  for (const row of rows) {
    const key = `${row.bucket}:${row.classifier_vote}`
    const draft = drafts.get(key) ?? newDraft(row)
    draft.decisions += row.decisions
    draft.probability_sum += row.probability_sum
    draft.effective_lower_threshold.min = Math.min(
      draft.effective_lower_threshold.min,
      row.lower_min,
    )
    draft.effective_lower_threshold.max = Math.max(
      draft.effective_lower_threshold.max,
      row.lower_max,
    )
    draft.effective_upper_threshold.min = Math.min(
      draft.effective_upper_threshold.min,
      row.upper_min,
    )
    draft.effective_upper_threshold.max = Math.max(
      draft.effective_upper_threshold.max,
      row.upper_max,
    )
    if (row.human_outcome !== 'none') {
      draft.human_decisions += row.decisions
      draft.outcomes[row.human_outcome] += row.decisions
    }
    drafts.set(key, draft)
  }
  return [...drafts.values()].map(({ probability_sum, outcomes, ...cell }) => ({
    ...cell,
    mean_probability: probability_sum / cell.decisions,
    human: cell.human_voters >= CLASSIFIER_COMPARISON_MIN_HUMAN_COHORT ? outcomes : null,
  }))
}

function newDraft(row: ComparisonRow): CellDraft {
  const width = 1 / CLASSIFIER_COMPARISON_BUCKET_COUNT
  return {
    probability_lower: roundTenth(row.bucket * width),
    probability_upper: roundTenth((row.bucket + 1) * width),
    classifier_vote: row.classifier_vote as ClassifierComparisonVote,
    decisions: 0,
    probability_sum: 0,
    effective_lower_threshold: { min: row.lower_min, max: row.lower_max },
    effective_upper_threshold: { min: row.upper_min, max: row.upper_max },
    human_decisions: 0,
    human_voters: row.human_voters,
    outcomes: { up: 0, down: 0, neutral: 0 },
  }
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10
}
