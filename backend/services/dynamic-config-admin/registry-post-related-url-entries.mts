import {
  POST_RELATED_URL_DISPLAY_MAX_VALUES,
  POST_RELATED_URL_DISPLAY_MIN_VALUES,
  postRelatedUrlDisplayConfig,
} from '@services/entity-relations/post-related-url-display-config'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'

export const postRelatedUrlDisplayRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'post-related-url-display-config',
    label: 'Post Related URL Display',
    description: 'Presentation bounds for post related URL summaries.',
    config: postRelatedUrlDisplayConfig,
    access: { update_roles: ['developer'] },
    fields: {
      summary_limit: {
        description: 'Maximum positive best-ranked related URLs shown in post asides.',
        min_value: POST_RELATED_URL_DISPLAY_MIN_VALUES.summary_limit,
        max_value: POST_RELATED_URL_DISPLAY_MAX_VALUES.summary_limit,
        integer: true,
      },
    },
  }),
]
