import {
  USER_IMPORT_EXPORT_MAX_VALUES,
  USER_IMPORT_EXPORT_MIN_VALUES,
  userImportExportConfig,
} from '@services/user-import-export/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const userImportExportRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'user-import-export-config',
  label: 'User Import/Export',
  description: 'Runtime bounds for user data import and export workflows.',
  config: userImportExportConfig,
  access: { update_roles: ['developer'] },
  fields: {
    sync_export_max_items: {
      description: 'Maximum items allowed in synchronous RSS feed and topic exports.',
      minValue: USER_IMPORT_EXPORT_MIN_VALUES.sync_export_max_items,
      maxValue: USER_IMPORT_EXPORT_MAX_VALUES.sync_export_max_items,
      integer: true,
    },
    sync_export_cursor_batch_size: {
      description: 'Rows fetched at a time by synchronous RSS feed and topic export cursors.',
      minValue: USER_IMPORT_EXPORT_MIN_VALUES.sync_export_cursor_batch_size,
      maxValue: USER_IMPORT_EXPORT_MAX_VALUES.sync_export_cursor_batch_size,
      integer: true,
    },
    import_max_body_bytes: {
      description: 'Largest JSON body, in bytes, the RSS feed import endpoint reads.',
      minValue: USER_IMPORT_EXPORT_MIN_VALUES.import_max_body_bytes,
      maxValue: USER_IMPORT_EXPORT_MAX_VALUES.import_max_body_bytes,
      integer: true,
    },
    import_dispatch_page_size: {
      description: 'Pending rows one import dispatcher page puts on the queue before it continues.',
      minValue: USER_IMPORT_EXPORT_MIN_VALUES.import_dispatch_page_size,
      maxValue: USER_IMPORT_EXPORT_MAX_VALUES.import_dispatch_page_size,
      integer: true,
    },
    import_insert_chunk_size: {
      description: 'Rows one INSERT statement writes when an RSS feed import is submitted.',
      minValue: USER_IMPORT_EXPORT_MIN_VALUES.import_insert_chunk_size,
      maxValue: USER_IMPORT_EXPORT_MAX_VALUES.import_insert_chunk_size,
      integer: true,
    },
    import_recovery_batch_size: {
      description: 'Stalled RSS feed imports one recovery sweep re-dispatches.',
      minValue: USER_IMPORT_EXPORT_MIN_VALUES.import_recovery_batch_size,
      maxValue: USER_IMPORT_EXPORT_MAX_VALUES.import_recovery_batch_size,
      integer: true,
    },
    topic_attempt_prune_batch_size: {
      description: 'Expired topic import attempts removed per cleanup page.',
      minValue: USER_IMPORT_EXPORT_MIN_VALUES.topic_attempt_prune_batch_size,
      maxValue: USER_IMPORT_EXPORT_MAX_VALUES.topic_attempt_prune_batch_size,
      integer: true,
    },
    import_status_page_size: {
      description: 'Rows one page of an RSS feed import status lists.',
      minValue: USER_IMPORT_EXPORT_MIN_VALUES.import_status_page_size,
      maxValue: USER_IMPORT_EXPORT_MAX_VALUES.import_status_page_size,
      integer: true,
    },
    rss_feed_import_budget_ms: {
      description:
        'Time in milliseconds one imported feed gets across Web Risk and both protocol attempts.',
      minValue: USER_IMPORT_EXPORT_MIN_VALUES.rss_feed_import_budget_ms,
      maxValue: USER_IMPORT_EXPORT_MAX_VALUES.rss_feed_import_budget_ms,
      integer: true,
    },
  },
})
