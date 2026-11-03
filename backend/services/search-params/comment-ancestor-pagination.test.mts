import { describe, expect, it } from 'vitest'
import { paginationConfig } from '@services/pagination'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { prepareCommentAncestorPagination } from './comment-ancestor-pagination.mts'

describe('bounded ancestor pagination', () => {
  it('always bounds the window by the runtime limits', () => {
    overrideDynamicConfigFieldsForTest(paginationConfig, { default_limit: 2, max_limit: 3 })
    expect(prepareCommentAncestorPagination({}).pageQuery).toEqual({ after: undefined, limit: 2 })
    expect(prepareCommentAncestorPagination({ after: 'cursor' }).pageQuery).toEqual({
      after: 'cursor',
      limit: 2,
    })
    expect(prepareCommentAncestorPagination({ limit: 5 }).pageQuery.limit).toBe(3)
    expect(prepareCommentAncestorPagination({ limit: 5 }).validationQuery.limit).toBe(3)
  })
})
