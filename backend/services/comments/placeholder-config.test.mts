import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  COMMENT_PLACEHOLDER_MAX_VALUES,
  commentPlaceholderConfig,
  getCommentDescendantMaxDepth,
  getCommentDescendantReadLimits,
  getCommentLookDownLimits,
} from './placeholder-config.mts'

describe('comment preview and placeholder look-down limits', () => {
  it('defaults to bounded heads, child previews, and look-down', () => {
    expect(getCommentDescendantMaxDepth()).toBe(7)
    expect(getCommentDescendantReadLimits()).toEqual({
      maxHeads: 100,
      maxChildrenPerHead: 100,
      maxRows: 200,
    })
    expect(getCommentLookDownLimits()).toEqual({ maxDepth: 5, maxRows: 50 })
    expect(COMMENT_PLACEHOLDER_MAX_VALUES).toEqual({
      descendant_max_depth: 20,
      descendant_max_heads: 200,
      descendant_max_children_per_head: 500,
      descendant_max_rows: 1000,
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

  it('allows a shallow preview because opening any comment starts another window', () => {
    const restore = overrideDynamicConfigFieldsForTest(commentPlaceholderConfig, {
      descendant_max_depth: 2,
    })
    try {
      expect(getCommentDescendantMaxDepth()).toBe(2)
    } finally {
      restore()
    }
  })
})
