import {
  listImportConfig,
  LIST_IMPORT_MAX_ITEMS,
  COMMUNITY_LIST_MAX_FEEDS,
  listImportMaxValues,
} from '@services/lists/import-config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const listImportRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'list-import-config',
  label: 'List Import',
  description:
    'Bounds community list feeds and the number of posts and RSS items copied by one import.',
  config: listImportConfig,
  access: { update_roles: ['developer'] },
  fields: {
    add_list_items_max: {
      description: 'Maximum visible posts and RSS items accepted by one list-item batch.',
      minValue: 1,
      maxValue: listImportMaxValues.add_list_items_max,
      integer: true,
    },
    import_feed_item_limit: {
      description: 'Maximum items copied from each RSS feed by one community-list import.',
      minValue: 1,
      maxValue: listImportMaxValues.import_feed_item_limit,
      integer: true,
    },
    max_items: {
      description: 'Maximum number of posts and RSS items per import source.',
      minValue: 1,
      maxValue: LIST_IMPORT_MAX_ITEMS,
      integer: true,
    },
    max_community_list_feeds: {
      description: 'Maximum active RSS feeds in a community list.',
      minValue: 1,
      maxValue: COMMUNITY_LIST_MAX_FEEDS,
      integer: true,
    },
  },
})
