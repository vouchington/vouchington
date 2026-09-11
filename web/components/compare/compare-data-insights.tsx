import type { Topic } from '@/types/topics'
import type { TopicDataPointInsights } from '@/types/topic-data-point-insights'
import { formatNumber, type NumberFormatLocale } from '@ts-shared/utils/format'
import type { Translator } from '@ts-shared/ui-messages'
import { CompareStatRow } from './compare-stat-row'
import { formatMoney } from '@/lib/money'
import type { Money } from '@ts-shared/money'

interface CompareDataInsightsProps {
  topicA: Topic
  topicB: Topic
  insightsA?: TopicDataPointInsights
  insightsB?: TopicDataPointInsights
  uiLocale: NumberFormatLocale
  t: Translator
}

export function CompareDataInsights({
  topicA,
  topicB,
  insightsA,
  insightsB,
  uiLocale,
  t,
}: CompareDataInsightsProps) {
  return (
    <section className='space-y-3'>
      <h2 className='text-lg font-semibold'>
        {t('extracted.compare.compareDataInsights.dataPointInsights_3a191817')}
      </h2>
      <div className='rounded-md border bg-card'>
        <CompareStatRow
          label={t('extracted.compare.compareDataInsights.totalDataPoints_481371f6')}
          valueA={formatNumber(insightsA?.total_count ?? 0, uiLocale)}
          valueB={formatNumber(insightsB?.total_count ?? 0, uiLocale)}
          topicAName={topicA.name}
          topicBName={topicB.name}
          t={t}
        />
        <CompareStatRow
          label={t('extracted.compare.compareDataInsights.approvalRate_ab799051')}
          valueA={formatApprovalRate(insightsA?.approval_rate, uiLocale, t)}
          valueB={formatApprovalRate(insightsB?.approval_rate, uiLocale, t)}
          topicAName={topicA.name}
          topicBName={topicB.name}
          t={t}
        />
        <CompareStatRow
          label={t('extracted.compare.compareDataInsights.medianCreditLimit_887adf6c')}
          valueA={formatCreditLimits(insightsA?.median_credit_limits, uiLocale, t)}
          valueB={formatCreditLimits(insightsB?.median_credit_limits, uiLocale, t)}
          topicAName={topicA.name}
          topicBName={topicB.name}
          t={t}
        />
      </div>
    </section>
  )
}

function formatApprovalRate(
  rate: number | null | undefined,
  locale: NumberFormatLocale,
  t: Translator,
): string {
  if (rate == null) return t('extracted.compare.compareDataInsights.nA_e2f79e5b')
  return rate.toLocaleString(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  })
}

function formatCreditLimits(
  limits: Money[] | undefined,
  locale: NumberFormatLocale,
  t: Translator,
): string {
  if (!limits?.length) return t('extracted.compare.compareDataInsights.nA_e2f79e5b')
  return limits.map(limit => formatMoney(limit, locale)).join(', ')
}
