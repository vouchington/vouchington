'use client'

import { ArrowRight } from 'lucide-react'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { ConversionFunnel } from '@/types/landing-pages'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  funnel: ConversionFunnel
}

function FunnelStep({
  label,
  value,
  rate,
  note,
}: {
  label: string
  value: number
  rate?: number
  note?: string
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <div className='flex-1 rounded-xl border border-border bg-card p-4 shadow-sm'>
      <p className='text-sm font-medium text-muted-foreground'>{label}</p>
      <p className='mt-1 text-2xl font-bold'>{formatNumber(value, uiLocale)}</p>
      {rate !== undefined && (
        <p className='mt-1 text-sm text-muted-foreground'>
          {t('extracted.my.analyticsConversionFunnel.rateConversion_07539ceb', {
            rate: (rate * 100).toFixed(1),
          })}
        </p>
      )}
      {note && <p className='mt-1 text-xs text-muted-foreground'>{note}</p>}
    </div>
  )
}

function Arrow() {
  return (
    <div className='flex items-center justify-center px-2 text-muted-foreground'>
      <ArrowRight
        className='rotate-90 sm:rotate-0'
        aria-hidden='true'
      />
    </div>
  )
}

export function AnalyticsConversionFunnel({ funnel }: Props) {
  const t = useTranslations()
  return (
    <section>
      <h2 className='mb-4 text-lg font-semibold'>
        {t('extracted.my.analyticsConversionFunnel.conversionFunnel_61bdac81')}
      </h2>
      <div className='flex flex-col items-stretch gap-2 sm:flex-row sm:items-center'>
        <FunnelStep
          label={t('extracted.my.analyticsConversionFunnel.visits_f514c310')}
          value={funnel.total_visits}
        />
        <Arrow />
        <FunnelStep
          label={t('extracted.my.analyticsConversionFunnel.clicks_921fc980')}
          value={funnel.total_clicks}
          rate={funnel.visit_to_click_rate}
        />
        <Arrow />
        <FunnelStep
          label={t('extracted.my.analyticsConversionFunnel.signups_5c2b0617')}
          value={funnel.total_signups}
          note={t('extracted.my.analyticsConversionFunnel.allLandingPages_470875a4')}
        />
      </div>
    </section>
  )
}
