import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  look_down_max_depth: 5,
  look_down_max_rows: 50,
}

/** Hard ceilings: a placeholder never costs more than this many levels or rows to settle. */
export const COMMENT_PLACEHOLDER_MAX_VALUES = {
  look_down_max_depth: 20,
  look_down_max_rows: 500,
}

export const commentPlaceholderConfig = new DynamicConfig({
  key: 'comment-placeholder-config',
  fieldTypes: { look_down_max_depth: 'number', look_down_max_rows: 'number' },
  defaultFields,
})

export type CommentLookDownLimits = { maxDepth: number; maxRows: number }

/** The limits one request applies when deciding whether a placeholder has a valid reply below it. */
export function getCommentLookDownLimits(): CommentLookDownLimits {
  const read = (field: keyof typeof defaultFields) =>
    getBoundedPositiveIntegerField(commentPlaceholderConfig, field, {
      defaultValue: defaultFields[field],
      maxValue: COMMENT_PLACEHOLDER_MAX_VALUES[field],
    })
  return { maxDepth: read('look_down_max_depth'), maxRows: read('look_down_max_rows') }
}
