import type { TopicRatingStats } from './types.mts'

export function normalizeTopicRatingStats(row: Record<string, unknown>): TopicRatingStats {
  return {
    ratings__score__1: Number(row.ratings__score__1) || 0,
    ratings__score__2: Number(row.ratings__score__2) || 0,
    ratings__score__3: Number(row.ratings__score__3) || 0,
    ratings__score__4: Number(row.ratings__score__4) || 0,
    ratings__score__5: Number(row.ratings__score__5) || 0,
    ratings__count__1: Number(row.ratings__count__1) || 0,
    ratings__count__2: Number(row.ratings__count__2) || 0,
    ratings__count__3: Number(row.ratings__count__3) || 0,
    ratings__count__4: Number(row.ratings__count__4) || 0,
    ratings__count__5: Number(row.ratings__count__5) || 0,
  }
}
