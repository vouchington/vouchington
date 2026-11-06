import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  COMMENT_PLACEHOLDER_MAX_VALUES,
  commentPlaceholderConfig,
  getCommentDescendantMaxDepth,
  getCommentLookDownLimits,
} from './placeholder-config.mts'

describe('comment walk and placeholder look-down limits', () => {
  it('defaults to seven walk levels and bounded look-down limits', () => {
    expect(getCommentDescendantMaxDepth()).toBe(7)
    expect(getCommentLookDownLimits()).toEqual({ maxDepth: 5, maxRows: 50 })
    expect(COMMENT_PLACEHOLDER_MAX_VALUES).toEqual({
      descendant_max_depth: 20,
      look_down_max_depth: 20,
      look_down_max_rows: 500,
    })
  })

  it('uses the safe default when a stored depth exceeds the hard maximum', () => {
    const restore = overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_depth: 21,
    })
    try {
      expect(getCommentDescendantMaxDepth()).toBe(7)
    } finally {
      restore()
    }
  })

  it('raises a stored depth below the deeper-replies minimum to seven levels', () => {
    const restore = overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_depth: 2,
    })
    try {
      expect(getCommentDescendantMaxDepth()).toBe(7)
    } finally {
      restore()
    }
  })
})
