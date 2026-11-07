'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { ModerationAnalytics } from '@/types/moderation-analytics'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatLabel } from './moderation-analytics-format'

export function ModerationAnalyticsRankedLists({ metrics }: { metrics: ModerationAnalytics }) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <section className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
      <RankedList
        title={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.ruleViolations_8f0d0e75',
        )}
        empty={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.noReportsInThisPeriod_7d879fa7',
        )}
        rows={metrics.rule_violations.reasons.map(row => ({
          key: row.reason,
          label: formatLabel(row.reason),
          value: formatNumber(row.count, uiLocale),
        }))}
        data-pw='moderation-analytics-list-rule-violations'
      />
      <RankedList
        title={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.automodSources_b9a82cc3',
        )}
        empty={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.noAutomodActionsInThisPeriod_1891e28b',
        )}
        rows={metrics.automod_performance.sources.map(row => ({
          key: row.source_type,
          label: formatLabel(row.source_type),
          value: formatNumber(row.count, uiLocale),
        }))}
        data-pw='moderation-analytics-list-automod-sources'
      />
      <RankedList
        title={t('extracted.moderationAnalytics.moderationAnalyticsDashboard.confidence_6422e3e7')}
        empty={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.noConfidenceDataInThisPeriod_4f4971ff',
        )}
        rows={metrics.automod_performance.confidence_distribution.map(row => ({
          key: row.bucket,
          label: row.bucket,
          value: formatNumber(row.count, uiLocale),
        }))}
        data-pw='moderation-analytics-list-confidence'
      />
    </section>
  )
}

function RankedList({
  title,
  empty,
  rows,
  'data-pw': dataPw,
}: {
  title: string
  empty: string
  rows: { key: string; label: string; value: string }[]
  'data-pw'?: string
}) {
  return (
    // oxlint-disable-next-line no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- call sites always pass a literal; default omitted to avoid ghost selectors
    <Card data-pw={dataPw}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className='py-6 text-center text-sm text-muted-foreground'>{empty}</p>
        ) : (
          <ol className='space-y-3'>
            {rows.slice(0, 8).map(row => (
              <li
                key={row.key}
                className='flex items-center justify-between gap-3 text-sm'
              >
                <span className='min-w-0 truncate'>{row.label}</span>
                <span className='font-semibold'>{row.value}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
