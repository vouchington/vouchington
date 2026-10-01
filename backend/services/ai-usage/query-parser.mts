import { createPaginationParser } from '@modules/pagination'
export const aiCostTotalsParser = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { default: 25, max: 100 },
})
