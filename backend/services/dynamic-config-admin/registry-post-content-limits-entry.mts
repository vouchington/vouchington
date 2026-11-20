import {
  DEFAULT_POST_CONTENT_LIMITS,
  POST_CONTENT_LIMITS_MAX_VALUES,
  POST_CONTENT_LIMITS_MIN_VALUES,
  postContentLimitsConfig,
  type PostContentLimitsConfig,
} from '@services/post-content-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

const DESCRIPTIONS: Record<keyof PostContentLimitsConfig, string> = {
  data_point_topic_ids_max_items: 'Maximum topic IDs allowed in one data point payload.',
  review_topic_ratings_max_items: 'Maximum review topic ratings allowed in one review payload.',
  post_images_max:
    'Maximum images attached to one post. Lowering it rejects new writes above it; posts already stored above it stay readable.',
}

export const postContentLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'post-content-limits-config',
  label: 'Post Content Limits',
  description: 'Limits for topic IDs, review ratings and images in post payloads.',
  config: postContentLimitsConfig,
  access: { update_roles: ['moderator'] },
  fields: Object.fromEntries(
    Object.keys(DEFAULT_POST_CONTENT_LIMITS).map(name => [
      name,
      {
        description: DESCRIPTIONS[name as keyof PostContentLimitsConfig],
        minValue: POST_CONTENT_LIMITS_MIN_VALUES[name as keyof PostContentLimitsConfig],
        maxValue: POST_CONTENT_LIMITS_MAX_VALUES[name as keyof PostContentLimitsConfig],
        integer: true,
      },
    ]),
  ),
})
