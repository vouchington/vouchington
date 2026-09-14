'use client'

import { KpiCards } from './kpi-cards'
import { DateRangeFilter } from './date-range-filter'
import { UserGrowthChart } from './user-growth-chart'
import { ContentProductionChart } from './content-production-chart'
import { EngagementChart } from './engagement-chart'
import { RevenueChart } from './revenue-chart'
import { NetworkEffectsCards } from './network-effects-cards'
import { ContentHealth } from './content-health'
import { InfrastructureMetricsPanel } from './infrastructure-metrics'
import type { GrowthMetrics } from '@/types/growth-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  metrics: GrowthMetrics
}

export default function GrowthDashboard({ metrics }: Props) {
  const t = useTranslations()
  return (
    <div
      className='space-y-8'
      data-pw='localization-growth-dashboard'
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1
            data-pw='growth-dashboard-heading'
            className='text-xl font-bold sm:text-2xl md:text-3xl'
          >
            {t('extracted.growth.growthDashboard.growthDashboard_5f95c2d1')}
          </h1>
          <p
            className='mt-1 text-sm text-muted-foreground'
            suppressHydrationWarning
          >
            {t('extracted.growth.growthDashboard.periodstartPeriodend_019842e2', {
              periodStart: new Date(metrics.period_start).toLocaleDateString(undefined, {
                timeZone: 'UTC',
              }),
              periodEnd: new Date(metrics.period_end).toLocaleDateString(undefined, {
                timeZone: 'UTC',
              }),
            })}
          </p>
        </div>
        <DateRangeFilter range={metrics.range} />
      </div>

      <KpiCards metrics={metrics} />

      <section>
        <h2 className='mb-3 text-lg font-semibold'>
          {t('extracted.growth.growthDashboard.userGrowth_c584d5eb')}
        </h2>
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          <UserGrowthChart userGrowth={metrics.user_growth} />
          <NetworkEffectsCards networkEffects={metrics.network_effects} />
        </div>
      </section>

      <section>
        <h2 className='mb-3 text-lg font-semibold'>
          {t('extracted.growth.growthDashboard.contentEngagement_a953066f')}
        </h2>
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          <ContentProductionChart contentProduction={metrics.content_production} />
          <EngagementChart engagement={metrics.engagement} />
        </div>
      </section>

      <section>
        <h2 className='mb-3 text-lg font-semibold'>
          {t('extracted.growth.growthDashboard.revenueContentHealth_d0a476c1')}
        </h2>
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          <RevenueChart revenue={metrics.revenue} />
          <ContentHealth contentProduction={metrics.content_production} />
        </div>
      </section>

      <InfrastructureMetricsPanel infrastructure={metrics.infrastructure} />
    </div>
  )
}
