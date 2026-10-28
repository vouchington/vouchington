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

export function addUserMetrics(stats: TopicMergeMetricStats, row: MetricUserRow): void {
  if (row.vote_weight === null) return
  const weight = row.vote_weight
  const score = row.topic_vote_score
  if (score !== null) {
    if (score > 0) {
      stats.votes_score_up +=
        (score === 1 && !row.topic_vote_score_is_semantic ? 2 : score) * weight
      stats.votes_count_up++
    } else if (score < 0) {
      stats.votes_score_down -=
        (score === -1 && !row.topic_vote_score_is_semantic ? -2 : score) * weight
      stats.votes_count_down++
    } else if (row.topic_vote_score_is_neutral) {
      stats.votes_score_none += weight
      stats.votes_count_none++
    }
  }

  const review = row.review_rating
  if (review !== null) incrementRatingCount(stats, review)
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
  if (effectiveRating !== null) incrementRatingScore(stats, effectiveRating, weight)
}

function incrementRatingCount(stats: TopicMergeMetricStats, rating: number): void {
  switch (rating) {
    case 1:
      stats.ratings__count__1++
      break
    case 2:
      stats.ratings__count__2++
      break
    case 3:
      stats.ratings__count__3++
      break
    case 4:
      stats.ratings__count__4++
      break
    case 5:
      stats.ratings__count__5++
      break
  }
}

function incrementRatingScore(stats: TopicMergeMetricStats, rating: number, weight: number): void {
  switch (rating) {
    case 1:
      stats.ratings__score__1 += weight
      break
    case 2:
      stats.ratings__score__2 += weight
      break
    case 3:
      stats.ratings__score__3 += weight
      break
    case 4:
      stats.ratings__score__4 += weight
      break
    case 5:
      stats.ratings__score__5 += weight
      break
  }
}
