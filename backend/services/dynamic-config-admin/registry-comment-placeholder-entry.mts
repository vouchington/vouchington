import {
  COMMENT_DESCENDANT_MIN_DEPTH,
  COMMENT_PLACEHOLDER_MAX_VALUES,
  commentPlaceholderConfig,
} from '@services/comments/placeholder-config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const commentPlaceholderRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'comment-placeholder-config',
  label: 'Comment Placeholders',
  description:
    'Bounds on direct-child head pages, child previews, and the search below a deleted or unmoderated comment. A placeholder whose search hits a bound is kept.',
  config: commentPlaceholderConfig,
  access: { update_roles: ['developer'] },
  fields: {
    descendant_max_depth: {
      description:
        'Comment levels one bounded preview reads, counting immediate children as one. Opening any comment starts another preview.',
      minValue: COMMENT_DESCENDANT_MIN_DEPTH,
      maxValue: COMMENT_PLACEHOLDER_MAX_VALUES.descendant_max_depth,
      integer: true,
    },
    descendant_max_heads: {
      description: 'Direct-child heads inspected per page, including filtered heads.',
      minValue: 1,
      maxValue: COMMENT_PLACEHOLDER_MAX_VALUES.descendant_max_heads,
      integer: true,
    },
    descendant_max_children_per_head: {
      description: 'Child rows inspected while previewing one direct-child head.',
      minValue: 1,
      maxValue: COMMENT_PLACEHOLDER_MAX_VALUES.descendant_max_children_per_head,
      integer: true,
    },
    descendant_max_rows: {
      description: 'Child rows inspected across all heads in one page.',
      minValue: 1,
      maxValue: COMMENT_PLACEHOLDER_MAX_VALUES.descendant_max_rows,
      integer: true,
    },
    look_down_max_depth: {
      description: 'Levels below a placeholder searched for a valid reply.',
      minValue: 1,
      maxValue: COMMENT_PLACEHOLDER_MAX_VALUES.look_down_max_depth,
      integer: true,
    },
    look_down_max_rows: {
      description: 'Placeholder rows read below one placeholder while searching for a valid reply.',
      minValue: 1,
      maxValue: COMMENT_PLACEHOLDER_MAX_VALUES.look_down_max_rows,
      integer: true,
    },
  },
})
