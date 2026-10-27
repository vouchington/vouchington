/** Bounded merge scan positions and fencing values identify no joined row. */
export const TOPIC_MERGE_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'topic_merge_metric_users.cursor_review_post_id',
    'Deletion-tolerant keyset position for the latest eligible review seen in bounded metric pages, not a relationship.',
  ],
  [
    'topic_merge_metric_users.cursor_topic_vote_id',
    'Deletion-tolerant keyset position for the latest ballot seen in bounded metric pages, not a relationship.',
  ],
  [
    'topic_merge_operations.cursor_object_id',
    'Stage-scoped keyset coordinate whose target varies by bounded merge stage; not a durable relationship.',
  ],
  [
    'topic_merge_operations.cursor_row_id',
    'Stage-scoped keyset coordinate whose target varies by bounded merge stage; not a durable relationship.',
  ],
  [
    'topic_merge_operations.cursor_subject_id',
    'Stage-scoped keyset coordinate whose target varies by bounded merge stage; not a durable relationship.',
  ],
  [
    'topic_merge_parent_ancestors.cursor_object_id',
    'Deletion-tolerant keyset position in the bounded parent-edge traversal, not a relationship.',
  ],
  [
    'topic_merge_post_category_topic_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_rss_feed_item_category_topic_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_topic_category_topic_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_topic_faq_post_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_topic_faq_url_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_topic_guide_url_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_topic_landing_page_url_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_topic_publisher_type_topic_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_topic_related_post_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_topic_related_topic_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_topic_related_url_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_topic_term_of_service_url_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_user_category_topic_vote_owners.cursor_vote_id',
    'Latest original ballot-event keyset position for bounded election history pages; the scanned vote may be moved or deleted.',
  ],
  [
    'topic_merge_operations.fence_token',
    'Opaque per-operation worker capability/fencing token; identifies no durable row.',
  ],
])
