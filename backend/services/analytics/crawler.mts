import { emit, type CrawlerRequestRecord } from '@data-stores/analytics'

function makeBase(
  eventType: CrawlerRequestRecord['event_type'],
): Pick<CrawlerRequestRecord, 'event_id' | 'event_time' | 'event_date' | 'env' | 'event_type'> {
  const now = new Date()
  return {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    event_type: eventType,
  }
}

export function trackCrawlerRequest(
  crawlerType: string,
  domain: string,
  statusCode: number,
  durationMs: number,
  success: boolean,
  errorType?: string,
): void {
  emit('crawler_requests', {
    ...makeBase('request'),
    crawler_type: crawlerType,
    domain,
    status_code: statusCode,
    success,
    duration_ms: durationMs,
    error_type: errorType,
  })
}

export function trackDomainRateLimitLocked(
  crawlerType: string,
  domain: string,
  retryAfterMs: number,
): void {
  emit('crawler_requests', {
    ...makeBase('rate_limit_locked'),
    crawler_type: crawlerType,
    domain,
    success: false,
    duration_ms: 0,
    retry_after_ms: retryAfterMs,
  })
}

export function trackDomainRateLimitDeferred(
  crawlerType: string,
  domain: string,
  remainingMs: number,
): void {
  emit('crawler_requests', {
    ...makeBase('rate_limit_deferred'),
    crawler_type: crawlerType,
    domain,
    success: false,
    duration_ms: 0,
    remaining_ms: remainingMs,
  })
}
