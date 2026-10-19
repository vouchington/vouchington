import { storyRelatedItemsConfig } from '@services/stories/story-related-items-config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const storyRelatedItemsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'story-related-items-config',
  label: 'Story Related Items',
  description: 'Bounds for prefetched related story items.',
  config: storyRelatedItemsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    preview_limit: {
      description: 'Maximum related story items prefetched for each primary news result.',
      minValue: 1,
      maxValue: 3,
      integer: true,
    },
  },
})
