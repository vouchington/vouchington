'use client'

import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { InfrastructureMetrics } from '@/types/growth-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  infrastructure: InfrastructureMetrics
}

interface InfraCardProps {
  label: string
  value: string
  unavailable: boolean
}

function InfraCard({ label, value, unavailable }: InfraCardProps) {
  return (
    <div className='rounded-xl border border-border bg-card p-4 shadow-sm'>
      <p className='text-sm font-medium text-muted-foreground'>{label}</p>
      <p className={`mt-1 text-3xl font-bold ${unavailable ? 'text-muted-foreground' : ''}`}>
        {value}
      </p>
    </div>
  )
}

function formatRate(value: number | null, t: ReturnType<typeof useTranslations>) {
  if (value === null) {
    return { display: t('extracted.growth.infrastructureMetrics.nA_e2f79e5b'), unavailable: true }
  }
  return { display: `${(value * 100).toFixed(1)}%`, unavailable: false }
}

function formatCount(
  value: number | null,
  locale: string,
  t: ReturnType<typeof useTranslations>,
  suffix = '',
) {
  if (value === null) {
    return { display: t('extracted.growth.infrastructureMetrics.nA_e2f79e5b'), unavailable: true }
  }
  return { display: `${formatNumber(value, locale)}${suffix}`, unavailable: false }
}

export function InfrastructureMetricsPanel({ infrastructure }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const crawlerRate = formatRate(infrastructure.crawler_success_rate, t)
  const queueThroughput = formatCount(infrastructure.queue_throughput, uiLocale, t)
  const cacheHitRate = formatRate(infrastructure.cache_hit_rate, t)
  const aiTokens = formatCount(infrastructure.ai_token_usage, uiLocale, t)

  return (
    <section>
      <h2 className='mb-3 text-lg font-semibold'>
        {t('extracted.growth.infrastructureMetrics.infrastructure_ce0cff71')}
      </h2>
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
        <InfraCard
          label={t('extracted.growth.infrastructureMetrics.crawlerSuccessRate_e3538812')}
          value={crawlerRate.display}
          unavailable={crawlerRate.unavailable}
        />
        <InfraCard
          label={t('extracted.growth.infrastructureMetrics.queueThroughput_da62e8fa')}
          value={queueThroughput.display}
          unavailable={queueThroughput.unavailable}
        />
        <InfraCard
          label={t('extracted.growth.infrastructureMetrics.cacheHitRate_055f9718')}
          value={cacheHitRate.display}
          unavailable={cacheHitRate.unavailable}
        />
        <InfraCard
          label={t('extracted.growth.infrastructureMetrics.aiTokensUsed_8c6d495e')}
          value={aiTokens.display}
          unavailable={aiTokens.unavailable}
        />
      </div>
    </section>
  )
}
