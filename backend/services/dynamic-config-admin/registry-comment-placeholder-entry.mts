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
    'Bounds on a descendant walk and the search below a deleted or unmoderated comment for a valid reply. A placeholder whose search hits a bound is kept.',
  config: commentPlaceholderConfig,
  access: { update_roles: ['developer'] },
  fields: {
    descendant_max_depth: {
      description:
        'Comment levels one descendant walk reads, counting immediate children as one. At least seven, so threads keep their deeper-replies link.',
      minValue: COMMENT_DESCENDANT_MIN_DEPTH,
      maxValue: COMMENT_PLACEHOLDER_MAX_VALUES.descendant_max_depth,
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
