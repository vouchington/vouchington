import type { GrowthMetrics, GrowthRange } from './types.mts'
import { getUserGrowth } from './get-user-growth.mts'
import { getContentProduction } from './get-content-production.mts'
import { getEngagement } from './get-engagement.mts'
import { getNetworkEffects } from './get-network-effects.mts'
import { getRevenue } from './get-revenue.mts'
import { getInfrastructureMetrics } from './get-infrastructure-metrics.mts'

const GROWTH_METRICS_CACHE_TTL_MS = 10_000
const growthMetricsCache = new Map<
  GrowthRange,
  { expiresAt: number; promise: Promise<GrowthMetrics> }
>()

export function getGrowthMetrics(range: GrowthRange): Promise<GrowthMetrics> {
  const now = Date.now()
  const cached = growthMetricsCache.get(range)
  if (cached && cached.expiresAt > now) return cached.promise

  const promise = loadGrowthMetrics(range).catch(error => {
    if (growthMetricsCache.get(range)?.promise === promise) growthMetricsCache.delete(range)
    throw error as Error
  })
  growthMetricsCache.set(range, { expiresAt: now + GROWTH_METRICS_CACHE_TTL_MS, promise })
  return promise
}

async function loadGrowthMetrics(range: GrowthRange): Promise<GrowthMetrics> {
  const now = new Date()
  const periodStart = getRangeStart(range, now)

  const [userGrowth, contentProduction, engagement, networkEffects, revenue, infrastructure] =
    await Promise.all([
      getUserGrowth(range, periodStart),
      getContentProduction(range, periodStart),
      getEngagement(range, periodStart),
      getNetworkEffects(range, periodStart),
      getRevenue(range, periodStart),
      getInfrastructureMetrics(range, periodStart),
    ])

  return {
    range,
    period_start: periodStart.toISOString(),
    period_end: now.toISOString(),
    user_growth: userGrowth,
    content_production: contentProduction,
    engagement,
    network_effects: networkEffects,
    revenue,
    infrastructure,
  }
}

export function clearGrowthMetricsCacheForTesting(): void {
  growthMetricsCache.clear()
}

export function getRangeStart(range: GrowthRange, now: Date): Date {
  const d = new Date(now)
  switch (range) {
    case 'today': {
      d.setUTCHours(0, 0, 0, 0)
      return d
    }
    case '7d': {
      d.setUTCDate(d.getUTCDate() - 7)
      return d
    }
    case '30d': {
      d.setUTCDate(d.getUTCDate() - 30)
      return d
    }
    case '90d': {
      d.setUTCDate(d.getUTCDate() - 90)
      return d
    }
    case 'all': {
      return new Date(0)
    }
  }
}
