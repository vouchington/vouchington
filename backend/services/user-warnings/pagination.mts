import { createPaginationParser } from '@modules/pagination'

export const userWarningsPagination = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})
