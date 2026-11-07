'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { ModerationAnalytics } from '@/types/moderation-analytics'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatPercent } from './moderation-analytics-format'

export function ModerationAnalyticsSummary({ metrics }: { metrics: ModerationAnalytics }) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
      <MetricCard
        label={t('extracted.moderationAnalytics.moderationAnalyticsDashboard.reports_dacca3cb')}
        value={formatNumber(metrics.queue_volume.total_reports, uiLocale)}
        detail={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.countPending_bc608dfb',
          {
            count: formatNumber(metrics.queue_volume.pending_reports, uiLocale),
          },
        )}
        data-pw='moderation-analytics-card-reports'
      />
      <MetricCard
        label={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.automodActions_2acb9bc4',
        )}
        value={formatNumber(metrics.automod_performance.total_actions, uiLocale)}
        detail={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.countAutoRemoves_38d75240',
          { count: formatNumber(metrics.automod_performance.auto_removes, uiLocale) },
        )}
        data-pw='moderation-analytics-card-automod-actions'
      />
      <MetricCard
        label={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.appealSuccess_94e52907',
        )}
        value={
          metrics.appeals.success_rate == null
            ? t('extracted.moderationAnalytics.moderationAnalyticsDashboard.nA_a683c5c5')
            : formatPercent(metrics.appeals.success_rate, uiLocale)
        }
        detail={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.countClosedAppeals_15c0cfb9',
          { count: formatNumber(metrics.appeals.total_closed, uiLocale) },
        )}
        data-pw='moderation-analytics-card-appeal-success'
      />
      <MetricCard
        label={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.newUserRejections_05c50235',
        )}
        value={
          metrics.new_user_friction.rejection_rate == null
            ? t('extracted.moderationAnalytics.moderationAnalyticsDashboard.nA_a683c5c5')
            : formatPercent(metrics.new_user_friction.rejection_rate, uiLocale)
        }
        detail={t(
          'extracted.moderationAnalytics.moderationAnalyticsDashboard.countRejectedFirstPosts_0e98bb37',
          { count: formatNumber(metrics.new_user_friction.rejected_first_posts, uiLocale) },
        )}
        data-pw='moderation-analytics-card-new-user-rejections'
      />
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  'data-pw': dataPw,
}: {
  label: string
  value: string
  detail: string
  'data-pw'?: string
}) {
  return (
    // oxlint-disable-next-line no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- call sites always pass a literal; default omitted to avoid ghost selectors
    <Card data-pw={dataPw}>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{value}</div>
        <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
      </CardContent>
    </Card>
  )
}
