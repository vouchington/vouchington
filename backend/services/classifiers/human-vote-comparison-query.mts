import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import {
  CLASSIFIER_COMPARISON_BUCKET_COUNT,
  CLASSIFIER_COMPARISON_MAX_BATCHES,
  type ClassifierHumanVoteComparisonOptions,
} from './human-vote-comparison-types.mts'

type CellColumns = {
  bucket: number
  classifier_vote: number
  human_outcome: 'none' | 'up' | 'down' | 'neutral'
  decisions: number
  probability_sum: number
  lower_min: number
  lower_max: number
  upper_min: number
  upper_max: number
  /** Distinct human voters behind every decision of this row's probability and vote cell. */
  human_voters: number
}

/** One cell and human outcome of the report, with the batch count of the whole window. */
export type ComparisonRow = CellColumns & {
  /** The number of batches the window selected, repeated on every row. */
  batches_selected: number
}

/** What the statement returns: a window without decisions is one row holding only the count. */
export type ComparisonQueryRow = { [K in keyof CellColumns]: CellColumns[K] | null } & {
  batches_selected: number
}

export function comparisonCellRows(rows: readonly ComparisonQueryRow[]): ComparisonRow[] {
  return rows.filter((row): row is ComparisonRow => row.bucket !== null)
}

/** The per-subject category relation and its ballot ledger. Fixed names, never request input. */
const SUBJECT_RELATIONS = [
  {
    subjectColumn: 'post_id',
    relation: 'relation__post__category__topic',
    votes: 'relation__post__category__topic__votes',
  },
  {
    subjectColumn: 'rss_feed_item_id',
    relation: 'relation__rss_feed_item__category__topic',
    votes: 'relation__rss_feed_item__category__topic__votes',
  },
] as const

/**
 * The human outcome of one decision: the sign of the summed latest ballots of its non-system voters
 * on the subject's live topic relation. Each voter counts once through their newest ballot, and a
 * newest ballot that is a clear counts as no ballot. System users (the classifier's own actor and
 * other platform accounts) are never joined, so they cannot appear as human votes.
 */
function humanOutcomeSelect(subject: (typeof SUBJECT_RELATIONS)[number]): string {
  return `
    SELECT decision.bucket, decision.classifier_vote, decision.probability, decision.lower,
      decision.upper, human.outcome AS human_outcome, human.voters
    FROM decisions decision
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN count(*) = 0 THEN 'none'
        WHEN sum(ballot.score) > 0 THEN 'up'
        WHEN sum(ballot.score) < 0 THEN 'down'
        ELSE 'neutral'
      END AS outcome,
      COALESCE(array_agg(ballot.user_id), '{}'::uuid[]) AS voters
      FROM ${subject.relation} relation
      CROSS JOIN LATERAL (
        SELECT latest.user_id, latest.score
        FROM (
          SELECT DISTINCT ON (vote.user_id) vote.user_id, vote.score
          FROM ${subject.votes} vote
          JOIN users voter ON voter.id = vote.user_id AND NOT voter.is_system
          WHERE vote.entity_relation_id = relation.id
          ORDER BY vote.user_id, vote.id DESC
        ) latest
        WHERE latest.score IS NOT NULL
      ) ballot
      WHERE relation.subject_id = decision.${subject.subjectColumn}
        AND relation.object_id = decision.topic_id
        AND relation.deleted_at IS NULL
    ) human
    WHERE decision.${subject.subjectColumn} IS NOT NULL`
}

/**
 * The report statement. The window is a UUIDv7 id range on `classifier_decision_batches`, so the
 * classifier, community, post and feed-item filters all resolve through an index that starts with
 * the filter and ends in `id` (or `(classifier_id, id)` for the classifier itself). At most
 * `MAX_BATCHES + 1` batches survive, newest first, so everything after is bounded by the cap and by
 * the candidates one batch can hold. Aggregation happens in SQL; no row is a vote or an identity.
 */
export function buildHumanVoteComparisonQuery(options: ClassifierHumanVoteComparisonOptions): {
  text: string
  values: unknown[]
} {
  const values: unknown[] = [
    options.classifierId,
    getMinUUIDv7ForDate(options.from),
    getMinUUIDv7ForDate(options.to),
    CLASSIFIER_COMPARISON_MAX_BATCHES + 1,
  ]
  const filters: string[] = []
  const addFilter = (column: string, value: string | undefined) => {
    if (value === undefined) return
    values.push(value)
    filters.push(`AND batch.${column} = $${values.length}::uuid`)
  }
  addFilter('scope_community_id', options.communityId)
  addFilter('post_id', options.postId)
  addFilter('rss_feed_item_id', options.rssFeedItemId)

  const text = `/* classifierHumanVoteComparison */
    WITH selected_batches AS (
      SELECT batch.id, batch.post_id, batch.rss_feed_item_id
      FROM classifier_decision_batches batch
      WHERE batch.classifier_id = $1
        AND batch.id >= $2::uuid
        AND batch.id < $3::uuid
        AND batch.completed_at IS NOT NULL
        ${filters.join('\n        ')}
      ORDER BY batch.id DESC
      LIMIT $4
    ), capped_batches AS (
      SELECT id, post_id, rss_feed_item_id FROM selected_batches ORDER BY id DESC LIMIT ${CLASSIFIER_COMPARISON_MAX_BATCHES}
    ), decisions AS (
      SELECT batch.post_id, batch.rss_feed_item_id, result.topic_id,
        LEAST(FLOOR(result.probability * ${CLASSIFIER_COMPARISON_BUCKET_COUNT}), ${CLASSIFIER_COMPARISON_BUCKET_COUNT - 1})::int AS bucket,
        CASE
          WHEN result.probability < result.effective_lower_threshold THEN -1
          WHEN result.probability > result.effective_upper_threshold THEN 1
          ELSE 0
        END AS classifier_vote,
        result.probability::float8 AS probability,
        result.effective_lower_threshold::float8 AS lower,
        result.effective_upper_threshold::float8 AS upper
      FROM capped_batches batch
      JOIN topic_classifier_results result ON result.batch_id = batch.id
    ), outcomes AS (
      ${SUBJECT_RELATIONS.map(humanOutcomeSelect).join('\n      UNION ALL\n')}
    ), cells AS (
      SELECT bucket, classifier_vote, human_outcome,
        count(*)::int AS decisions,
        sum(probability)::float8 AS probability_sum,
        min(lower)::float8 AS lower_min, max(lower)::float8 AS lower_max,
        min(upper)::float8 AS upper_min, max(upper)::float8 AS upper_max
      FROM outcomes
      GROUP BY 1, 2, 3
    ), cell_voters AS (
      SELECT outcomes.bucket, outcomes.classifier_vote, count(DISTINCT voter)::int AS human_voters
      FROM outcomes
      CROSS JOIN LATERAL unnest(outcomes.voters) AS voter
      GROUP BY 1, 2
    )
    SELECT cells.*, COALESCE(cell_voters.human_voters, 0) AS human_voters, meta.batches_selected
    FROM (SELECT count(*)::int AS batches_selected FROM selected_batches) meta
    LEFT JOIN cells ON TRUE
    LEFT JOIN cell_voters
      ON cell_voters.bucket = cells.bucket AND cell_voters.classifier_vote = cells.classifier_vote
    ORDER BY cells.bucket, cells.classifier_vote, cells.human_outcome`
  return { text, values }
}
