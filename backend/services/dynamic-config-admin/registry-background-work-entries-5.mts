import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import {
  postPublicationWorkConfig,
  postPublicationWorkMaxValues,
} from '@services/post-publication/work-limits'
import {
  rssFeedItemsWorkConfig,
  rssFeedItemsWorkMaxValues,
} from '@services/rss-feed-items/work-limits'
import { rssFeedsWorkConfig, rssFeedsWorkMaxValues } from '@services/rss-feeds/work-limits'
import {
  notificationsWorkConfig,
  notificationsWorkMaxValues,
} from '@services/notifications/work-limits'
import { bookmarksWorkConfig, bookmarksWorkMaxValues } from '@services/bookmarks/work-limits'

export const backgroundWorkRegistryEntries5 = {
  'post-publication-work-config': defineBoundedWorkNamespace(
    postPublicationWorkConfig,
    'Post publication',
    postPublicationWorkMaxValues,
    {
      capture_batch_size: 'Capture batch size for post publication processing.',
      dirty_work_key_batch_size: 'Dirty work key batch size for post publication processing.',
      identity_snapshot_page_size: 'Identity snapshot page size for post publication processing.',
      reconciliation_page_size: 'Reconciliation page size for post publication processing.',
      shadow_audit_page_size: 'Shadow audit page size for post publication processing.',
      story_lifecycle_lock_batch_size:
        'Story lifecycle lock batch size for post publication processing.',
      rss_feed_hard_delete_capture_batch_size:
        'Rss feed hard delete capture batch size for post publication processing.',
    },
  ),
  'rss-feed-items-work-config': defineBoundedWorkNamespace(
    rssFeedItemsWorkConfig,
    'Rss feed items',
    rssFeedItemsWorkMaxValues,
    {
      category_backfill_batch_size: 'Category backfill batch size for rss feed items processing.',
      backfill_invalidation_chunk_size:
        'Backfill invalidation chunk size for rss feed items processing.',
      source_publication_backfill_max_batch_size:
        'Maximum rows accepted by a source publication backfill page.',
      source_publication_backfill_batch_size:
        'Source publication backfill batch size for rss feed items processing.',
      category_invalidation_chunk_size:
        'Category invalidation chunk size for rss feed items processing.',
      category_snapshot_reconciliation_batch_size:
        'Category snapshot reconciliation batch size for rss feed items processing.',
      category_clear_batch_size: 'Category clear batch size for rss feed items processing.',
      sql_batch_size: 'Sql batch size for rss feed items processing.',
      category_sql_batch_size: 'Category sql batch size for rss feed items processing.',
      enqueue_batch_size: 'Enqueue batch size for rss feed items processing.',
      story_category_item_batch_size:
        'Story category item batch size for rss feed items processing.',
      story_category_change_batch_size:
        'Story category change batch size for rss feed items processing.',
    },
  ),
  'rss-feeds-work-config': defineBoundedWorkNamespace(
    rssFeedsWorkConfig,
    'Rss feeds',
    rssFeedsWorkMaxValues,
    {
      category_sql_batch_size: 'Category sql batch size for rss feeds processing.',
      category_backfill_batch_size: 'Category backfill batch size for rss feeds processing.',
      topic_alias_category_mapping_reconciliation_batch_size:
        'Topic alias category mapping reconciliation batch size for rss feeds processing.',
    },
  ),
  'notifications-work-config': defineBoundedWorkNamespace(
    notificationsWorkConfig,
    'Notifications',
    notificationsWorkMaxValues,
    {
      community_digest_recipient_batch_size:
        'Community digest recipient batch size for notifications processing.',
      reconcile_batch_size: 'Reconcile batch size for notifications processing.',
    },
  ),
  'bookmarks-work-config': defineBoundedWorkNamespace(
    bookmarksWorkConfig,
    'Bookmarks',
    bookmarksWorkMaxValues,
    {
      bloom_batch_size: 'Bloom batch size for bookmarks processing.',
      bloom_lookup_batch_size: 'Bloom lookup batch size for bookmarks processing.',
    },
  ),
}
