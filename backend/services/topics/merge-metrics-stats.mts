export type TopicMergeMetricStats = {
  votes_score_up: number
  votes_score_none: number
  votes_score_down: number
  votes_count_up: number
  votes_count_none: number
  votes_count_down: number
  ratings__score__1: number
  ratings__score__2: number
  ratings__score__3: number
  ratings__score__4: number
  ratings__score__5: number
  ratings__count__1: number
  ratings__count__2: number
  ratings__count__3: number
  ratings__count__4: number
  ratings__count__5: number
  bookmarks__follow_count: number
}

export function emptyTopicMergeMetricStats(): TopicMergeMetricStats {
  return {
    votes_score_up: 0,
    votes_score_none: 0,
    votes_score_down: 0,
    votes_count_up: 0,
    votes_count_none: 0,
    votes_count_down: 0,
    ratings__score__1: 0,
    ratings__score__2: 0,
    ratings__score__3: 0,
    ratings__score__4: 0,
    ratings__score__5: 0,
    ratings__count__1: 0,
    ratings__count__2: 0,
    ratings__count__3: 0,
    ratings__count__4: 0,
    ratings__count__5: 0,
    bookmarks__follow_count: 0,
  }
}

export type MetricUserRow = {
  user_id: string
  topic_vote_score: number | null
  topic_vote_score_is_neutral: boolean | null
  topic_vote_score_is_semantic: boolean | null
  review_rating: number | null
  vote_weight: number | null
}

export function addUserMetrics(
  stats: TopicMergeMetricStats,
  row: MetricUserRow,
): TopicMergeMetricStats {
  if (row.vote_weight === null) return stats
  const weight = row.vote_weight
  const score = row.topic_vote_score
  let next = stats
  if (score !== null) {
    if (score > 0) {
      next = {
        ...next,
        votes_score_up:
          next.votes_score_up +
          (score === 1 && !row.topic_vote_score_is_semantic ? 2 : score) * weight,
        votes_count_up: next.votes_count_up + 1,
      }
    } else if (score < 0) {
      next = {
        ...next,
        votes_score_down:
          next.votes_score_down -
          (score === -1 && !row.topic_vote_score_is_semantic ? -2 : score) * weight,
        votes_count_down: next.votes_count_down + 1,
      }
    } else if (row.topic_vote_score_is_neutral) {
      next = {
        ...next,
        votes_score_none: next.votes_score_none + weight,
        votes_count_none: next.votes_count_none + 1,
      }
    }
  }

  const review = row.review_rating
  if (review !== null) next = incrementRatingCount(next, review)
  let effectiveRating: number | null = null
  if (review !== null && review !== 3) effectiveRating = review
  else if (score !== null && (score !== 0 || row.topic_vote_score_is_neutral)) {
    const semanticScore =
      score === 1 && !row.topic_vote_score_is_semantic
        ? 2
        : score === -1 && !row.topic_vote_score_is_semantic
          ? -2
          : score
    effectiveRating = semanticScore + 3
  } else if (review !== null) effectiveRating = review
  if (effectiveRating !== null) next = incrementRatingScore(next, effectiveRating, weight)
  return next
}

type Rating = 1 | 2 | 3 | 4 | 5

function isRating(rating: number): rating is Rating {
  return rating === 1 || rating === 2 || rating === 3 || rating === 4 || rating === 5
}

function incrementRatingCount(stats: TopicMergeMetricStats, rating: number): TopicMergeMetricStats {
  if (!isRating(rating)) return stats
  const key = `ratings__count__${rating}` as const
  return { ...stats, [key]: stats[key] + 1 }
}

function incrementRatingScore(
  stats: TopicMergeMetricStats,
  rating: number,
  weight: number,
): TopicMergeMetricStats {
  if (!isRating(rating)) return stats
  const key = `ratings__score__${rating}` as const
  return { ...stats, [key]: stats[key] + weight }
}
