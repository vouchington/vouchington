export const EXTRA_BOUNDED_TABLES_CONTINUED = new Map<string, string>([
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
    'post_publication_dirty_work',
    'One coalesced row per exact publication dependency scope; successful exact-generation acknowledgement deletes the row, bounding cardinality to the active backlog.',
  ],
  [
    'post_publication_dirty_work_keys',
    'Retained keys cannot outlive their cascade-deleted dirty-work parent, so cardinality is bounded by the active backlog. The table remains partitioned by dirty_work_id because one active high-fanout scope can still contain enough keys to benefit from target-scoped pruning.',
  ],
  [
    'post_publication_reconciliation_audit_cursors',
    'One checkpoint per named operator scan bounds the audit state independently of post cardinality.',
  ],
])
