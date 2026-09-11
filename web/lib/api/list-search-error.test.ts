import { describe, expect, it } from 'vitest'
import { ApiError } from './error'
import { getListSearchErrorMessage } from './list-search-error'

describe('getListSearchErrorMessage', () => {
  it('returns backend messages for recoverable 400 and 422 search errors', () => {
    expect(
      getListSearchErrorMessage(new ApiError('Bad Request', 400, { error: 'Topic not found' })),
    ).toBe('Topic not found')
    expect(
      getListSearchErrorMessage(
        new ApiError('Unprocessable Entity', 422, { error: 'Too many topics' }),
      ),
    ).toBe('Too many topics')
  })

  it('ignores non-search ApiError statuses', () => {
    expect(getListSearchErrorMessage(new ApiError('Forbidden', 403))).toBeNull()
    expect(getListSearchErrorMessage(new ApiError('Server error', 500))).toBeNull()
  })
})
