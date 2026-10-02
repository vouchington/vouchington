import { createPaginationParser } from '@modules/pagination'

export const topicRecommendationsParser = createPaginationParser({
  cursor: { type: 'score', paramName: 'after' },
  limit: { min: 1, max: 100, default: 25 },
})
