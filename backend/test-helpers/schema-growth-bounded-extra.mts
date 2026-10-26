import { MODERATION_RETENTION_BOUNDED_TABLES } from './schema-growth-moderation-retention.mts'

export const EXTRA_BOUNDED_TABLES = new Map<string, string>([
  ...MODERATION_RETENTION_BOUNDED_TABLES,
  [
    'url_hostname_cache_invalidation_work_items',
    'At most one current generation per live hostname; successful eviction deletes it, hostname deletion cascades it, and bounded cache-TTL pruning removes abandoned work.',
  ],
  [
    'copyright_notice_form_screening_work_items',
    'One current execution per intake; completing or failing an attempt deletes its current work.',
  ],
  [
    'media_delivery_registry_projection_work_items',
    'One unfinished projection per delivery authority; terminal audit outcomes delete work, and explicit replay recreates it.',
  ],
  [
    'membership_operation_execution_work_items',
    'One row per unfinished provider operation; completion deletes work while durable refund and attempt ledgers remain.',
  ],
  [
    'oauth_authorization_exchange_attempts',
    'At most five immutable exchanges per bounded-lifetime authorization; retention cascades from the parent.',
  ],
  [
    'oauth_authorization_exchange_attempt_results',
    'Exactly one final result per bounded exchange attempt; parent retention cascades its history.',
  ],
  [
    'post_admission_attempts',
    'Numbered executions cascade with their admission reservation after the bounded replay retention window.',
  ],
  [
    'post_admission_attempt_results',
    'One immutable result per execution; cascades with bounded reservation retention.',
  ],
  [
    'retained_identity_cleanup_cursors',
    'One bounded cleanup cursor for each of seven concrete retained root identity families.',
  ],
  [
    'retained_image_placement_binding_cleanup_cursors',
    'A checked singleton bounds the independent placement binding sweep to one row.',
  ],
  [
    'retained_relation_identity_cleanup_cursors',
    'One bounded cleanup cursor for each metadata-declared elected relation family.',
  ],
  [
    'post_publication_community_identities',
    'Classifier run history can retain a community identity after live deletion; the generic retained-identity cleanup removes unreferenced rows in bounded pages.',
  ],
  [
    'media_delivery_repair_markers',
    'One coalesced marker per immutable delivery key; successful exact-token reconciliation deletes it, bounding cardinality to outstanding repair work.',
  ],
  [
    'oauth_access_tokens',
    'Access tokens expire after one hour and bounded data-retention batches delete expired rows.',
  ],
  [
    'oauth_authorization_codes',
    'Authorization codes expire after five minutes and bounded data-retention batches delete expired rows.',
  ],
  [
    'oauth_authorization_requests',
    'Authorization requests expire after ten minutes and bounded data-retention batches delete expired rows.',
  ],
  [
    'oauth_refresh_token_families',
    'Refresh-token families expire after thirty days and bounded data-retention batches delete each family and its cascading token members.',
  ],
  [
    'oauth_refresh_tokens',
    'Refresh tokens are bounded by their thirty-day family lifetime and cascade when bounded retention deletes the family.',
  ],
  [
    'membership_google_play_recovery_cursors',
    'One durable high-water mark per named Google Play recovery scan.',
  ],
  [
    'membership_microsoft_store_recovery_cursors',
    'One durable high-water mark per named Microsoft Store recovery scan.',
  ],
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
])
