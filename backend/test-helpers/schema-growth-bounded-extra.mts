export const EXTRA_BOUNDED_TABLES = new Map<string, string>([
  [
    'copyright_notice_form_screening_work_items',
    'One current execution per intake; completing or failing an attempt deletes its current work.',
  ],
  [
    'media_delivery_registry_projection_work_items',
    'One unfinished projection per delivery authority; terminal audit outcomes delete work, and explicit replay recreates it.',
  ],
  [
    'membership_renewal_price_increase_notification_work_items',
    'One latest notification snapshot per membership projection; completed or ambiguous outcomes prevent duplicates and membership retention cascades their removal.',
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
    'membership_google_play_acknowledgment_work_items',
    'One provider acknowledgement task per retained purchase obligation; deletion cascades from its parent.',
  ],
  [
    'membership_verification_processing_work_items',
    'One adapter processing task per retained verification; parent retention cascades its work.',
  ],
  [
    'stripe_event_processing_work_items',
    'One processing work item per immutable Stripe event, retained for deduplicated replay and bounded by inbound event retention.',
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
    'Only active dirty-work scopes or retained impact keys reference these repair identities; cyclic raw-capped reclamation deletes unreferenced rows, bounding cardinality to the active repair backlog.',
  ],
  [
    'post_publication_rss_feed_item_identities',
    'Only active dirty-work scopes or retained impact keys reference these repair identities; cyclic raw-capped reclamation deletes unreferenced rows, bounding cardinality to the active repair backlog.',
  ],
  [
    'post_publication_author_identities',
    'Only active dirty-work scopes or retained impact keys reference these repair identities; cyclic raw-capped reclamation deletes unreferenced rows, bounding cardinality to the active repair backlog.',
  ],
  [
    'post_publication_rss_feed_identities',
    'Only active dirty-work scopes or retained impact keys reference these repair identities; cyclic raw-capped reclamation deletes unreferenced rows, bounding cardinality to the active repair backlog.',
  ],
  [
    'post_publication_topic_alias_identities',
    'Only active dirty-work scopes or retained impact keys reference these repair identities; cyclic raw-capped reclamation deletes unreferenced rows, bounding cardinality to the active repair backlog.',
  ],
  [
    'post_publication_story_identities',
    'Only active dirty-work scopes or retained impact keys reference these repair identities; cyclic raw-capped reclamation deletes unreferenced rows, bounding cardinality to the active repair backlog.',
  ],
  [
    'post_publication_identity_bridge_cleanup_cursors',
    'A finite family primary key permits one independently advanced cursor per concrete identity bridge family.',
  ],
  [
    'media_delivery_repair_markers',
    'One coalesced marker per immutable delivery key; successful exact-token reconciliation deletes it, bounding cardinality to outstanding repair work.',
  ],
  [
    'post_publication_identity_snapshot_cleanup_cursors',
    'A checked true primary key permits exactly one bounded sweep cursor.',
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
