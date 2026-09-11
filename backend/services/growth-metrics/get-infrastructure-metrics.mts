import { query } from '@data-stores/analytics'
import type { GrowthRange, InfrastructureMetrics } from './types.mts'

type AnalyticsRow = {
  count?: number
  total?: number
  success?: number
  hit?: number
  tokens?: number
}

export async function getInfrastructureMetrics(
  range: GrowthRange,
  periodStart: Date,
): Promise<InfrastructureMetrics> {
  // Safe: effectiveStart is a system-generated Date, not user input.
  // Cap 'all' range at 90 days to avoid unbounded scans.
  const effectiveStart =
    range === 'all' ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) : periodStart

  const [crawlerRows, queueRows, cacheRows, aiRows] = await Promise.all([
    query<AnalyticsRow>(`
      SELECT
        SUM(CASE WHEN success = true THEN 1 ELSE 0 END) AS success,
        COUNT(*) AS total
      FROM crawler_requests
      WHERE event_type = 'request' AND event_time >= TIMESTAMP '${effectiveStart.toISOString()}'
    `),
    query<AnalyticsRow>(`
      SELECT COUNT(*) AS total
      FROM queue_jobs
      WHERE event = 'completed' AND event_time >= TIMESTAMP '${effectiveStart.toISOString()}'
    `),
    query<AnalyticsRow>(`
      SELECT
        COALESCE(SUM(hits), 0) AS hit,
        COALESCE(SUM(hits + misses), 0) AS total
      FROM valkey_cache_calls
      WHERE event_time >= TIMESTAMP '${effectiveStart.toISOString()}'
    `),
    query<AnalyticsRow>(`
      SELECT COALESCE(SUM(tokens), 0) AS tokens
      FROM ai_calls
      WHERE kind = 'embedding' AND event_time >= TIMESTAMP '${effectiveStart.toISOString()}'
    `),
  ])

  const crawlerRow = crawlerRows[0]
  const crawlerSuccessRate =
    crawlerRow && crawlerRow.total !== undefined && crawlerRow.total > 0
      ? (crawlerRow.success ?? 0) / crawlerRow.total
      : crawlerRow?.total === 0
        ? 0
        : null

  const queueRow = queueRows[0]
  const queueThroughput = queueRow?.total ?? null

  const cacheRow = cacheRows[0]
  const cacheHitRate =
    cacheRow && cacheRow.total !== undefined && cacheRow.total > 0
      ? (cacheRow.hit ?? 0) / cacheRow.total
      : cacheRow?.total === 0
        ? 0
        : null

  const aiRow = aiRows[0]
  const aiTokenUsage = aiRow?.tokens ?? null

  return {
    crawler_success_rate: crawlerSuccessRate,
    queue_throughput: queueThroughput,
    cache_hit_rate: cacheHitRate,
    ai_token_usage: aiTokenUsage,
  }
}
