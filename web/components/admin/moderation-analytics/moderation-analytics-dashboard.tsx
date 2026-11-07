'use client'

import { ModerationAnalyticsRangeFilter } from '@/components/moderation/moderation-analytics-range-filter'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatUtcDate } from '@ts-shared/utils/format'
import type { ModerationAnalytics } from '@/types/moderation-analytics'
import { ModerationAnalyticsCharts } from './moderation-analytics-charts'
import { ModerationAnalyticsRankedLists } from './moderation-analytics-ranked-lists'
import { ModerationAnalyticsSummary } from './moderation-analytics-summary'
import { ModerationAnalyticsWorkload } from './moderation-analytics-workload'

interface Props {
  metrics: ModerationAnalytics
  basePath: string
  title: string
  description?: string
}

export default function ModerationAnalyticsDashboard({
  metrics,
  basePath,
  title,
  description,
}: Props) {
  const t = useTranslations()

  return (
    <div
      className='space-y-6'
      data-pw='moderation-analytics-dashboard'
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h1 className='text-xl font-bold sm:text-2xl md:text-3xl'>{title}</h1>
          {description && <p className='mt-1 text-sm text-muted-foreground'>{description}</p>}
          <p className='mt-1 text-sm text-muted-foreground'>
            {t(
              'extracted.moderationAnalytics.moderationAnalyticsDashboard.periodstartToPeriodend_99363d47',
              {
                periodStart: formatUtcDate(metrics.period_start),
                periodEnd: formatUtcDate(metrics.period_end),
              },
            )}
          </p>
        </div>
        <ModerationAnalyticsRangeFilter
          basePath={basePath}
          range={metrics.range}
        />
      </div>
      <ModerationAnalyticsSummary metrics={metrics} />
      <ModerationAnalyticsCharts metrics={metrics} />
      <ModerationAnalyticsRankedLists metrics={metrics} />
      <ModerationAnalyticsWorkload metrics={metrics} />
    </div>
  )
}
