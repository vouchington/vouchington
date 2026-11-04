import { describe, expect, it } from 'vitest'
import { COMMENT_PLACEHOLDER_MAX_VALUES, getCommentLookDownLimits } from './placeholder-config.mts'

describe('comment placeholder look-down limits', () => {
  it('defaults to five levels and fifty rows, within the hard maximums', () => {
    expect(getCommentLookDownLimits()).toEqual({ maxDepth: 5, maxRows: 50 })
    expect(COMMENT_PLACEHOLDER_MAX_VALUES).toEqual({
      look_down_max_depth: 20,
      look_down_max_rows: 500,
    })
  })
})
