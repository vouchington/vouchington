export const EXTRA_BOUNDED_TABLES = new Map<string, string>([
  [
    'membership_ineligible_purchase_reversal_refund_scan_cycles',
    'The reversal-case foreign-key primary key permits exactly one reusable verification-cycle row per immutable reversal case; later passes rotate its generation in place.',
  ],
  [
    'story_post_related_url_projection_jobs',
    'One coalesced job per story post; terminal reconciliation deletes the job and cascades its receipts, bounding cardinality to the active projection backlog.',
  ],
  [
    'story_post_related_url_projection_receipts',
    'Receipts cannot outlive their cascade-deleted projection job, and a restarted generation deletes prior receipts, bounding cardinality to the active projection backlog and its current source snapshots.',
  ],
  [
    'story_post_related_url_projection_relation_mutations',
    'Mutation fences cannot outlive their cascade-deleted projection job, and restarted generations delete stale fences in bounded pages, bounding cardinality to active projection work and its post-capture relation confirmations.',
  ],
  [
    'user_topic_import_attempts',
    'Completed response replays and abandoned attempts expire after 48 hours, and bounded cleanup deletes both classes, bounding cardinality to recent topic-import traffic.',
  ],
  [
    'post_admission_quota_consumptions',
    'Committed quota rows are retained for seven days, while policy windows are capped at one day; bounded cleanup keeps cardinality tied to recent admission traffic.',
  ],
  [
    'topic_alias_category_mapping_reconciliations',
    'One coalesced row per alias with pending category-mapping work; successful reconciliation deletes the row, bounding cardinality to the active backlog.',
  ],
  [
    'rss_feed_item_category_snapshot_reconciliations',
    'One coalesced row per RSS item with pending category snapshot work; successful exact-generation reconciliation deletes the row, bounding cardinality to the active backlog.',
  ],
  [
    'rss_feed_item_source_category_snapshots',
    'One current snapshot per RSS feed-to-item source row; the source primary key bounds cardinality to live RSS feed item sources.',
  ],
  [
    'post_category_finalizations',
    'One coalesced durable finalization row per post; a post primary key bounds cardinality to live posts.',
  ],
  [
    'post_publication_dirty_work',
    'One coalesced row per exact publication dependency scope; successful exact-generation acknowledgement deletes the row, bounding cardinality to the active backlog.',
  ],
  [
    'post_publication_dirty_work_keys',
    'Retained keys cannot outlive their cascade-deleted dirty-work parent, so cardinality is bounded by the active backlog. The table remains partitioned by dirty_work_id because one active high-fanout scope can still contain enough keys to benefit from target-scoped pruning.',
  ],
  [
    'post_publication_reconciliation_audit_checkpoints',
    'One checkpoint per named operator scan bounds the audit state independently of post cardinality.',
  ],
])
