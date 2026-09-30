import { createPaginationParser } from '@modules/pagination'

/**
 * The `after` cursor and `limit` of `GET /api/v1/trending-posts`, shared with the agent tool so a
 * cursor and a limit mean the same thing on both. The limit is clamped to 1-100 and defaults to 20.
 */
export const trendingPostsPaginationParser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { min: 1, max: 100, default: 20 },
})
