import { emit, type ApiUsageRecord, type AnalyticsBaseRecord } from '@data-stores/analytics'

/** The dimensions of one settled API request, before the shared event envelope is added. */
export type ApiUsage = Omit<ApiUsageRecord, keyof AnalyticsBaseRecord>

// Every dimension is a validated identity id or a closed vocabulary. The stored fields are named one
// by one rather than spread, so a caller that forwards anything else (such as a bearer credential)
// still cannot widen the row that reaches the analytics pipeline.
export function trackApiUsage(usage: ApiUsage): void {
  const now = new Date()
  emit('api_usage', {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    surface: usage.surface,
    credential: usage.credential,
    user_id: usage.user_id,
    api_key_id: usage.api_key_id,
    oauth_client_id: usage.oauth_client_id,
    oauth_grant_id: usage.oauth_grant_id,
    plan: usage.plan,
    scope_class: usage.scope_class,
    unit: usage.unit,
    units: usage.units,
    status_code: usage.status_code,
    quota_limit: usage.quota_limit,
    duration_ms: usage.duration_ms,
  })
}
