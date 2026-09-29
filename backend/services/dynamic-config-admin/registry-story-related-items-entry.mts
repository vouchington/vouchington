import { storyRelatedItemsConfig } from '@services/stories/story-related-items-config'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'

export const storyRelatedItemsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'story-related-items-config',
  label: 'Story Related Items',
  description: 'Bounds for prefetched related story items.',
  config: storyRelatedItemsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    preview_limit: {
      description: 'Maximum related story items prefetched for each primary news result.',
      min_value: 1,
      max_value: 3,
      integer: true,
    },
  },
})
