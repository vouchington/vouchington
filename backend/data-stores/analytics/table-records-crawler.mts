import type { AnalyticsBaseRecord } from './table-records.mts'

export interface CrawlerRequestRecord extends AnalyticsBaseRecord {
  event_type:
    | 'request'
    | 'rate_limit_locked'
    | 'rate_limit_deferred'
    | 'network_backoff_opened'
    | 'network_backoff_closed'
  crawler_type: string
  domain: string
  status_code?: number
  success: boolean
  error_type?: string
  duration_ms: number
  retry_after_ms?: number
  remaining_ms?: number
}
