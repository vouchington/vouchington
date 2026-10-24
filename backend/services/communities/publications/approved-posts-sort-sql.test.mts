import { describe, expect, it } from 'vitest'
import {
  communityPostSortColumn,
  communityPostSortCursor,
  communityPostSortHydratedColumn,
  communityPostSortHydratedOrder,
  communityPostSortJoin,
  communityPostSortOrderLimit,
} from './approved-posts-sort-sql.mts'

describe('community post sort selector guards', () => {
  it('rejects an unknown sort in each query fragment', () => {
    const sort = 'unknown' as Parameters<typeof communityPostSortColumn>[0]
    expect(() => communityPostSortColumn(sort)).toThrow('Unknown community post sort')
    expect(() => communityPostSortJoin(sort)).toThrow('Unknown community post sort')
    expect(() => communityPostSortCursor(sort, undefined, undefined)).toThrow(
      'Unknown community post sort',
    )
    expect(() => communityPostSortOrderLimit(sort, 10)).toThrow('Unknown community post sort')
    expect(() => communityPostSortHydratedColumn(sort)).toThrow('Unknown community post sort')
    expect(() => communityPostSortHydratedOrder(sort)).toThrow('Unknown community post sort')
  })
})
