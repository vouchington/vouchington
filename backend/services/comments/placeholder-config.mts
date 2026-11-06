import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  descendant_max_depth: 7,
  look_down_max_depth: 5,
  look_down_max_rows: 50,
}

/**
 * Fewest levels one descendant walk may read. The web thread renders its deeper-replies link only on
 * a comment at zero-based depth 5 with a loaded child, so a walk must reach seven levels.
 */
export const COMMENT_DESCENDANT_MIN_DEPTH = 7

/** Hard ceilings for the descendant walk and placeholder look-down. */
export const COMMENT_PLACEHOLDER_MAX_VALUES = {
  descendant_max_depth: 20,
  look_down_max_depth: 20,
  look_down_max_rows: 500,
}

export const commentPlaceholderConfig = new DynamicConfig({
  key: 'comment-placeholder-config',
  fieldTypes: {
    descendant_max_depth: 'number',
    look_down_max_depth: 'number',
    look_down_max_rows: 'number',
  },
  defaultFields,
})

export type CommentLookDownLimits = { maxDepth: number; maxRows: number }

const read = (field: keyof typeof defaultFields) =>
  getBoundedPositiveIntegerField(commentPlaceholderConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: COMMENT_PLACEHOLDER_MAX_VALUES[field],
  })

/** Number of comment levels returned by one descendant walk, counting its immediate children as one. */
export function getCommentDescendantMaxDepth(): number {
  return Math.max(read('descendant_max_depth'), COMMENT_DESCENDANT_MIN_DEPTH)
}

/** The limits one request applies when deciding whether a placeholder has a valid reply below it. */
export function getCommentLookDownLimits(): CommentLookDownLimits {
  return { maxDepth: read('look_down_max_depth'), maxRows: read('look_down_max_rows') }
}
