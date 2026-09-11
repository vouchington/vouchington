'use client'

import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { NetworkEffects } from '@/types/growth-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  networkEffects: NetworkEffects
}

interface MetricRowProps {
  label: string
  value: string
  sub?: string
}

function MetricRow({ label, value, sub }: MetricRowProps) {
  return (
    <div className='flex items-center justify-between border-b border-border py-3 last:border-0'>
      <div>
        <p className='text-sm font-medium'>{label}</p>
        {sub && <p className='text-xs text-muted-foreground'>{sub}</p>}
      </div>
      <p className='text-lg font-bold'>{value}</p>
    </div>
  )
}

export function NetworkEffectsCards({ networkEffects }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <div className='rounded-xl border border-border bg-card p-4 shadow-sm'>
      <h3 className='mb-2 text-base font-semibold'>
        {t('extracted.growth.networkEffectsCards.networkEffects_b6363baa')}
      </h3>
      <MetricRow
        label={t('extracted.growth.networkEffectsCards.referralCoefficient_14b6b1a7')}
        value={networkEffects.referral_coefficient.toFixed(2)}
        sub={t('extracted.growth.networkEffectsCards.viralLoopMultiplier_2d6e805e')}
      />
      <MetricRow
        label={t('extracted.growth.networkEffectsCards.topicCoverage_21cda90b')}
        value={`${(networkEffects.topic_coverage_rate * 100).toFixed(1)}%`}
        sub={t('extracted.growth.networkEffectsCards.topicsWith5Reviews_6fcc37a6')}
      />
      <MetricRow
        label={t('extracted.growth.networkEffectsCards.lpVisits_f4908098')}
        value={formatNumber(networkEffects.landing_page_visits, uiLocale)}
        sub={t('extracted.growth.networkEffectsCards.landingPageVisits_4b49f9c9')}
      />
      <MetricRow
        label={t('extracted.growth.networkEffectsCards.newSignups_e1f0e616')}
        value={formatNumber(networkEffects.new_signups, uiLocale)}
        sub={t('extracted.growth.networkEffectsCards.newUsersInPeriod_b69f0a8e')}
      />
      <MetricRow
        label={t('extracted.growth.networkEffectsCards.newUsersLpVisit_05e9adc0')}
        value={`${(networkEffects.signup_visit_ratio * 100).toFixed(1)}%`}
        sub={t('extracted.growth.networkEffectsCards.globalNewUsersPerLpVisit_c3e9d25a')}
      />
    </div>
  )
}
