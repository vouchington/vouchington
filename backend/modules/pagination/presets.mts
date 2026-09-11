import { createPaginationParser } from './factory.mts'

export const simplePaginationParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
})

export const preciseTimestampPaginationParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 50 },
})

export const rankingPaginationParser = createPaginationParser({
  cursor: { type: 'ranking' },
  limit: { min: 1, max: 100, default: 50 },
})
