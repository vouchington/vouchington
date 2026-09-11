'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Lock } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber, formatUtcDate } from '@ts-shared/utils/format'
import {
  moderationTransparencyCategoryLabel,
  moderationTransparencyMetricLabel,
} from './moderation-transparency-labels'
import type { ModerationTransparency } from '@/types/moderation-analytics'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import { useModerationTransparencyPagination } from './use-moderation-transparency-pagination'

interface ModerationTransparencyPanelProps {
  transparency: ModerationTransparency | null | undefined
  isLoading?: boolean
  showTitle?: boolean
  scope?: { communitySlug?: string }
}

export function ModerationTransparencyPanel({
  transparency,
  isLoading = false,
  showTitle = true,
  scope,
}: ModerationTransparencyPanelProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(uiLocale, { month: 'short', timeZone: 'UTC', year: 'numeric' }),
    [uiLocale],
  )
  const { displayed, fetchError, loadingMore, clearError, loadOlder } =
    useModerationTransparencyPagination(transparency, scope?.communitySlug)
  const isAllTime = displayed?.range === 'all'

  if (isLoading) {
    return (
      <Card>
        <CardContent
          className='p-4 text-sm text-muted-foreground'
          aria-busy='true'
        >
          {t(
            'extracted.moderationAnalytics.moderationTransparencyPanel.loadingModerationTransparency_4ec39367',
          )}
        </CardContent>
      </Card>
    )
  }

  if (displayed == null) {
    return (
      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <Lock className='h-4 w-4 text-muted-foreground' />
            <h2 className='text-base font-semibold leading-none tracking-tight'>
              {t(
                'extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparencyIsAvailableWithPlusOrPro_9d7062ce',
              )}
            </h2>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            {t(
              'extracted.moderationAnalytics.moderationTransparencyPanel.upgradeToViewDelayedPrivacyProtectedAggregateData_c5a3b0a7',
            )}
          </p>
          <Button asChild>
            <Link
              href='/plans'
              prefetch={false}
            >
              {t('extracted.tags.tagLimitCta.viewPlans_a72e2bd3')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <section className='space-y-3'>
      {showTitle ? (
        <div>
          <h2 className='text-lg font-semibold'>
            {t(
              'extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparency_0e1d33a9',
            )}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t(
              'extracted.moderationAnalytics.moderationTransparencyPanel.releasedAggregateModerationDataCountsAreDelayedAndPrivacyProtected_9a7a228c',
            )}
          </p>
        </div>
      ) : null}
      {displayed.buckets.length === 0 ? (
        <Card>
          <CardContent className='p-4 text-sm text-muted-foreground'>
            {t(
              'extracted.moderationAnalytics.moderationTransparencyPanel.noAggregateDataIsAvailableForThisPeriod_83f45b65',
            )}
          </CardContent>
        </Card>
      ) : (
        <div className='overflow-x-auto rounded-md border'>
          <table
            aria-label={t(
              'extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparency_0e1d33a9',
            )}
            className='w-full text-sm'
          >
            <caption className='sr-only'>
              {t(
                'extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparency_0e1d33a9',
              )}
            </caption>
            <thead className='bg-muted/50 text-left text-muted-foreground'>
              <tr>
                <th
                  scope='col'
                  className='p-3 font-medium'
                >
                  {t(
                    isAllTime
                      ? 'extracted.moderationAnalytics.moderationAnalyticsDashboard.period_d4ba2180'
                      : 'extracted.moderationAnalytics.moderationTransparencyPanel.date_5be1d4d9',
                  )}
                </th>
                <th
                  scope='col'
                  className='p-3 font-medium'
                >
                  {t('extracted.moderationAnalytics.moderationTransparencyPanel.metric_56f3d785')}
                </th>
                <th
                  scope='col'
                  className='p-3 font-medium'
                >
                  {t('extracted.moderationAnalytics.moderationTransparencyPanel.category_42f0a517')}
                </th>
                <th
                  scope='col'
                  className='p-3 text-right font-medium'
                >
                  {t('extracted.moderationAnalytics.moderationTransparencyPanel.count_5c89f13f')}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayed.buckets.map(bucket => (
                <tr
                  key={`${bucket.date}:${bucket.metric}:${bucket.category}`}
                  className='border-t'
                >
                  <td className='p-3'>
                    {isAllTime
                      ? monthFormatter.format(new Date(`${bucket.date}T00:00:00.000Z`))
                      : formatUtcDate(bucket.date, uiLocale)}
                  </td>
                  <td className='p-3'>{moderationTransparencyMetricLabel(bucket.metric, t)}</td>
                  <td className='p-3'>{moderationTransparencyCategoryLabel(bucket.category, t)}</td>
                  <td className='p-3 text-right tabular-nums'>
                    {formatNumber(bucket.count, uiLocale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isAllTime ? (
        <PaginatedListFooter
          fetchError={fetchError}
          canLoadMore={Boolean(displayed.next_cursor)}
          loadingMore={loadingMore}
          clearError={clearError}
          loadMore={loadOlder}
        />
      ) : null}
    </section>
  )
}
