'use client'

import { useMemo } from 'react'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ReportJudgementCounts({
  judgedReportCount,
  judgedReportCountCapped,
  currentReportCount,
  currentReportCountCapped,
  uiLocale,
}: {
  judgedReportCount: number | null
  judgedReportCountCapped: boolean
  currentReportCount: number
  currentReportCountCapped: boolean
  uiLocale: string
}) {
  const t = useTranslations()
  const exactNumberFormat = useMemo(() => new Intl.NumberFormat(uiLocale), [uiLocale])
  const compactNumberFormat = useMemo(
    () =>
      new Intl.NumberFormat(uiLocale, {
        notation: 'compact',
        maximumFractionDigits: 1,
        roundingMode: 'floor',
      }),
    [uiLocale],
  )
  const formattedCount = (count: number, capped: boolean) => {
    const label = t('shared.countLabel.format', { count, unit: 'report' })
    return capped
      ? label.replace(exactNumberFormat.format(count), `${compactNumberFormat.format(count)}+`)
      : label
  }

  return (
    <div className='flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
      {judgedReportCount === null ? null : (
        <span>
          {t('extracted.moderation.reportJudgementCounts.atJudgement', {
            countLabel: formattedCount(judgedReportCount, judgedReportCountCapped),
          })}
        </span>
      )}
      <span>
        {t('extracted.moderation.reportJudgementCounts.current', {
          countLabel: formattedCount(currentReportCount, currentReportCountCapped),
        })}
      </span>
    </div>
  )
}
