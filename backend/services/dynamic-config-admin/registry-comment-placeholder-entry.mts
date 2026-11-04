import {
  COMMENT_PLACEHOLDER_MAX_VALUES,
  commentPlaceholderConfig,
} from '@services/comments/placeholder-config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const commentPlaceholderRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'comment-placeholder-config',
  label: 'Comment Placeholders',
  description:
    'Bounds on the search below a deleted or unmoderated comment for a valid reply. A placeholder whose search hits a bound is kept.',
  config: commentPlaceholderConfig,
  access: { update_roles: ['developer'] },
  fields: {
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
