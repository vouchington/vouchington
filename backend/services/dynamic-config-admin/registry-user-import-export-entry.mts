import {
  USER_IMPORT_EXPORT_MAX_VALUES,
  USER_IMPORT_EXPORT_MIN_VALUES,
  userImportExportConfig,
} from '@services/user-import-export/config'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'
import { validateUserImportExportConfig } from './registry-validators.mts'

export const userImportExportRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'user-import-export-config',
  label: 'User Import/Export',
  description: 'Runtime bounds for user data import and export workflows.',
  config: userImportExportConfig,
  access: { update_roles: ['developer'] },
  fields: {
    sync_export_max_items: {
      description: 'Maximum items allowed in synchronous RSS feed and topic exports.',
      min_value: USER_IMPORT_EXPORT_MIN_VALUES.sync_export_max_items,
      max_value: USER_IMPORT_EXPORT_MAX_VALUES.sync_export_max_items,
      integer: true,
    },
    import_max_body_bytes: {
      description: 'Largest JSON body, in bytes, the RSS feed import endpoint reads.',
      min_value: USER_IMPORT_EXPORT_MIN_VALUES.import_max_body_bytes,
      max_value: USER_IMPORT_EXPORT_MAX_VALUES.import_max_body_bytes,
      integer: true,
    },
    import_dispatch_page_size: {
      description: 'Pending rows one import dispatcher page puts on the queue before it continues.',
      min_value: USER_IMPORT_EXPORT_MIN_VALUES.import_dispatch_page_size,
      max_value: USER_IMPORT_EXPORT_MAX_VALUES.import_dispatch_page_size,
      integer: true,
    },
    import_insert_chunk_size: {
      description: 'Rows one INSERT statement writes when an RSS feed import is submitted.',
      min_value: USER_IMPORT_EXPORT_MIN_VALUES.import_insert_chunk_size,
      max_value: USER_IMPORT_EXPORT_MAX_VALUES.import_insert_chunk_size,
      integer: true,
    },
    rss_feed_import_budget_ms: {
      description:
        'Time in milliseconds one imported feed gets across Web Risk and both protocol attempts.',
      min_value: USER_IMPORT_EXPORT_MIN_VALUES.rss_feed_import_budget_ms,
      max_value: USER_IMPORT_EXPORT_MAX_VALUES.rss_feed_import_budget_ms,
      integer: true,
    },
  },
  validate: validateUserImportExportConfig,
})
