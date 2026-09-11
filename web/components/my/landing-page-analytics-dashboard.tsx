'use client'

import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { LandingPageAnalytics, LandingPageItem } from '@/types/landing-pages'
import { AnalyticsVisitTrendChart } from './analytics-visit-trend-chart'
import { AnalyticsUtmBreakdownChart } from './analytics-utm-breakdown-chart'
import { AnalyticsConversionFunnel } from './analytics-conversion-funnel'
import { AnalyticsItemClicksTable } from './analytics-item-clicks-table'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  analytics: LandingPageAnalytics
  items: LandingPageItem[]
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className='rounded-xl border border-border bg-card p-4 shadow-sm'>
      <p className='text-sm font-medium text-muted-foreground'>{label}</p>
      <p className='mt-1 text-3xl font-bold'>{value}</p>
    </div>
  )
}

export function LandingPageAnalyticsDashboard({ analytics, items }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const ctrPercent = (analytics.ctr * 100).toFixed(1)

  return (
    <div className='mx-auto max-w-3xl space-y-4'>
      <h1 className='text-2xl font-bold'>
        {t('extracted.my.landingPageAnalyticsDashboard.analytics_94c116ee')}
      </h1>

      <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
        <StatCard
          label='Unique Visitors (30 days)'
          value={formatNumber(analytics.unique_visitors, uiLocale)}
        />
        <StatCard
          label='Total Visits'
          value={formatNumber(analytics.total_visits, uiLocale)}
        />
        <StatCard
          label='Click-Through Rate'
          value={`${ctrPercent}%`}
        />
      </div>

      {analytics.daily_stats.length > 0 && (
        <AnalyticsVisitTrendChart dailyStats={analytics.daily_stats} />
      )}

      <AnalyticsConversionFunnel funnel={analytics.conversion_funnel} />

      {analytics.utm_sources.length > 0 && (
        <AnalyticsUtmBreakdownChart utmSources={analytics.utm_sources} />
      )}

      {analytics.item_clicks.length > 0 && (
        <AnalyticsItemClicksTable
          itemClicks={analytics.item_clicks}
          items={items}
        />
      )}
    </div>
  )
}
