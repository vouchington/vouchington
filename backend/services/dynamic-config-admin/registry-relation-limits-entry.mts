import {
  relationLimitsConfig,
  relationLimitsMaxValues,
} from '@services/entity-relations/relation-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const relationLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'relation-limits-config',
  label: 'Relation limits',
  description: 'Maximum active relations per subject, including related URLs per post.',
  config: relationLimitsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    post_related_url: {
      description: 'Maximum active related URL relations per post.',
      minValue: 1,
      maxValue: relationLimitsMaxValues.post_related_url,
      integer: true,
    },
    follow_user: {
      description: 'Maximum active follow user relations per user.',
      minValue: 1,
      maxValue: relationLimitsMaxValues.follow_user,
      integer: true,
    },
    follow_topic: {
      description: 'Maximum active follow topic relations per user.',
      minValue: 1,
      maxValue: relationLimitsMaxValues.follow_topic,
      integer: true,
    },
    follow_rss_feed: {
      description: 'Maximum active follow rss feed relations per user.',
      minValue: 1,
      maxValue: relationLimitsMaxValues.follow_rss_feed,
      integer: true,
    },
    follow_post: {
      description: 'Maximum active follow post relations per user.',
      minValue: 1,
      maxValue: relationLimitsMaxValues.follow_post,
      integer: true,
    },
    subscribe_user: {
      description: 'Maximum active subscribe user relations per user.',
      minValue: 1,
      maxValue: relationLimitsMaxValues.subscribe_user,
      integer: true,
    },
    subscribe_post: {
      description: 'Maximum active subscribe post relations per user.',
      minValue: 1,
      maxValue: relationLimitsMaxValues.subscribe_post,
      integer: true,
    },
    subscribe_rss_feed: {
      description: 'Maximum active subscribe rss feed relations per user.',
      minValue: 1,
      maxValue: relationLimitsMaxValues.subscribe_rss_feed,
      integer: true,
    },
    subscribe_posts_topic: {
      description: 'Maximum active subscribe posts topic relations per user.',
      minValue: 1,
      maxValue: relationLimitsMaxValues.subscribe_posts_topic,
      integer: true,
    },
    subscribe_rss_feed_items_topic: {
      description: 'Maximum active subscribe rss feed items topic relations per user.',
      minValue: 1,
      maxValue: relationLimitsMaxValues.subscribe_rss_feed_items_topic,
      integer: true,
    },
  },
})
