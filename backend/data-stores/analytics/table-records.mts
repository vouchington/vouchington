/** Shared fields present in every analytics record. */
export interface AnalyticsBaseRecord {
  event_time: Date
  /** Partition key, YYYY-MM-DD */
  event_date: string
  /** UUID */
  event_id: string
  env: string
}

// ---------------------------------------------------------------------------
// crawler_requests
// ---------------------------------------------------------------------------

export interface CrawlerRequestRecord extends AnalyticsBaseRecord {
  event_type: 'request' | 'rate_limit_locked' | 'rate_limit_deferred'
  crawler_type: string
  domain: string
  status_code?: number
  success: boolean
  error_type?: string
  duration_ms: number
  retry_after_ms?: number
  remaining_ms?: number
}

// ---------------------------------------------------------------------------
// valkey_cache_calls
// ---------------------------------------------------------------------------

export interface ValkeyCacheCallRecord extends AnalyticsBaseRecord {
  cache_name: string
  batch: boolean
  hits: number
  misses: number
  bloom_misses: number
  duration_ms: number
}

// ---------------------------------------------------------------------------
// queue_jobs
// ---------------------------------------------------------------------------

export interface QueueJobRecord extends AnalyticsBaseRecord {
  queue: string
  job: string
  event:
    | 'enqueued'
    | 'active'
    | 'completed'
    | 'failed'
    | 'paused'
    | 'resumed'
    | 'stalled'
    | 'progress'
  count?: number
  duration_ms?: number
}

// ---------------------------------------------------------------------------
// queue_workers
// ---------------------------------------------------------------------------

export interface QueueWorkerRecord extends AnalyticsBaseRecord {
  queue: string
  event: string
}

// ---------------------------------------------------------------------------
// rss_feed_processing
// ---------------------------------------------------------------------------

export interface RssFeedProcessingRecord extends AnalyticsBaseRecord {
  event_type: 'truncated'
  rss_feed_id: string
  total_parsed_items: number
  valid_items_before_cap: number
  returned_items: number
  item_cap: number
  item_truncated_count: number
  category_cap: number
  category_truncated_item_count: number
  category_truncated_count: number
}

// ---------------------------------------------------------------------------
// ai_calls
// ---------------------------------------------------------------------------

interface AIEmbeddingRecord extends AnalyticsBaseRecord {
  kind: 'embedding'
  service: string
  model: string
  entity_type?: string
  error_type?: string
  tokens: number
  duration_ms: number
  invocation?: 'single' | 'batch'
}

interface AIModerationRecord extends AnalyticsBaseRecord {
  kind: 'moderation'
  service: string
  model: string
  tokens: number
  duration_ms: number
  error_type?: string
}

interface AIEmbeddingShortCircuitRecord extends AnalyticsBaseRecord {
  kind: 'embedding_short_circuit'
  reason: string
  entity_type: string
}

export type AICallRecord = AIEmbeddingRecord | AIModerationRecord | AIEmbeddingShortCircuitRecord

// ---------------------------------------------------------------------------
// web_page_view
// ---------------------------------------------------------------------------

export interface WebPageViewRecord extends AnalyticsBaseRecord {
  page_kind: 'landing_page' | 'topic' | 'post' | 'rss_feed_item' | 'rss_feed' | 'user'
  page_id?: string
  session_id?: string
  user_id?: string
  referrer?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
}

// ---------------------------------------------------------------------------
// web_click
// ---------------------------------------------------------------------------

export interface WebClickRecord extends AnalyticsBaseRecord {
  page_kind: string
  page_id?: string
  target_kind: string
  target_id?: string
  group_member_id?: string
  session_id?: string
  user_id?: string
}

// ---------------------------------------------------------------------------
// auth_sessions
// ---------------------------------------------------------------------------

export interface AuthSessionRecord extends AnalyticsBaseRecord {
  event_type: 'created' | 'refreshed_authenticated' | 'refreshed_anonymous'
  device_id: string
  session_id: string
  user_id?: string
  authenticated: boolean
}

// ---------------------------------------------------------------------------
// contribution_admission
// ---------------------------------------------------------------------------

export interface ContributionAdmissionRecord extends AnalyticsBaseRecord {
  source: string
  identity_origin: 'caller_supplied' | 'server_generated'
  outcome: 'created' | 'replay' | 'mismatch' | 'in_progress' | 'failed'
  duration_ms: number
}
