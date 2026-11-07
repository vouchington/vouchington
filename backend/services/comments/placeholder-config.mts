import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  descendant_max_depth: 7,
  descendant_max_heads: 100,
  descendant_max_children_per_head: 100,
  descendant_max_rows: 200,
  look_down_max_depth: 5,
  look_down_max_rows: 50,
}

/** A returned comment can open a new bounded descendant window at any depth. */
export const COMMENT_DESCENDANT_MIN_DEPTH = 1

/** Hard ceilings for the descendant walk and placeholder look-down. */
export const COMMENT_PLACEHOLDER_MAX_VALUES = {
  descendant_max_depth: 20,
  descendant_max_heads: 200,
  descendant_max_children_per_head: 500,
  descendant_max_rows: 1000,
  look_down_max_depth: 20,
  look_down_max_rows: 500,
}

export const commentPlaceholderConfig = new DynamicConfig({
  key: 'comment-placeholder-config',
  fieldTypes: {
    descendant_max_depth: 'number',
    descendant_max_heads: 'number',
    descendant_max_children_per_head: 'number',
    descendant_max_rows: 'number',
    look_down_max_depth: 'number',
    look_down_max_rows: 'number',
  },
  defaultFields,
})

export type CommentLookDownLimits = { maxDepth: number; maxRows: number }
export type CommentDescendantReadLimits = {
  maxHeads: number
  maxChildrenPerHead: number
  maxRows: number
}

const read = (field: keyof typeof defaultFields) =>
  getBoundedPositiveIntegerField(commentPlaceholderConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: COMMENT_PLACEHOLDER_MAX_VALUES[field],
  })

/** Number of comment levels returned by one descendant walk, counting its immediate children as one. */
export function getCommentDescendantMaxDepth(): number {
  return Math.max(read('descendant_max_depth'), COMMENT_DESCENDANT_MIN_DEPTH)
}

/** Raw rows fetched for one bounded preview, including filtered placeholders. */
export function getCommentDescendantReadLimits(): CommentDescendantReadLimits {
  return {
    maxHeads: read('descendant_max_heads'),
    maxChildrenPerHead: read('descendant_max_children_per_head'),
    maxRows: read('descendant_max_rows'),
  }
}

/** The limits one request applies when deciding whether a placeholder has a valid reply below it. */
export function getCommentLookDownLimits(): CommentLookDownLimits {
  return { maxDepth: read('look_down_max_depth'), maxRows: read('look_down_max_rows') }
}
