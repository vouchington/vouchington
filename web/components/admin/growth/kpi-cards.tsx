'use client'

import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { GrowthMetrics } from '@/types/growth-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatScaledMoneyAggregateList } from '@/lib/money'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div
      className='rounded-xl border border-border bg-card p-4 shadow-sm'
      data-pw='kpi-card'
    >
      <p className='text-sm font-medium text-muted-foreground'>{label}</p>
      <p className='mt-1 text-3xl font-bold'>{value}</p>
      {sub && <p className='mt-1 text-xs text-muted-foreground'>{sub}</p>}
    </div>
  )
}

interface Props {
  metrics: GrowthMetrics
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

export function KpiCards({ metrics }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const { user_growth, content_production, engagement, network_effects, revenue } = metrics

  return (
    <section>
      <h2 className='mb-3 text-lg font-semibold'>
        {t('extracted.growth.kpiCards.keyMetrics_abceb9fe')}
      </h2>
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'>
        <StatCard
          label={t('extracted.growth.kpiCards.totalUsers_0ca3aa44')}
          value={formatNumber(user_growth.total_users, uiLocale)}
        />
        <StatCard
          label={t('extracted.growth.kpiCards.newUsers_d3ee48b0')}
          value={formatNumber(user_growth.new_users, uiLocale)}
          sub={t('extracted.growth.kpiCards.inPeriod_d07fba9a')}
        />
        <StatCard
          label={t('extracted.growth.kpiCards.dauMau_003e8195')}
          value={formatPercent(user_growth.dau_mau_ratio)}
          sub={t('extracted.growth.kpiCards.dauDauMauMau_b4bde38e', {
            dau: formatNumber(user_growth.dau, uiLocale),
            mau: formatNumber(user_growth.mau, uiLocale),
          })}
        />
        <StatCard
          label={t('extracted.growth.kpiCards.totalPosts_531e3694')}
          value={formatNumber(content_production.total_posts, uiLocale)}
          sub={t('extracted.growth.kpiCards.inPeriod_d07fba9a')}
        />
        <StatCard
          label={t('extracted.growth.kpiCards.contributionsUser_a602409d')}
          value={content_production.contributions_per_active_user.toFixed(1)}
          sub={t('extracted.growth.kpiCards.perActiveUser_11ffc913')}
        />
        <StatCard
          label={t('extracted.growth.kpiCards.votesCast_0f1ab139')}
          value={formatNumber(engagement.votes_cast, uiLocale)}
          sub={t('extracted.growth.kpiCards.inPeriod_d07fba9a')}
        />
        <StatCard
          label={t('extracted.growth.kpiCards.referralCoefficient_14b6b1a7')}
          value={network_effects.referral_coefficient.toFixed(2)}
          sub={t('extracted.growth.kpiCards.viralLoop_5d486fef')}
        />
        <StatCard
          label={t('extracted.growth.kpiCards.topicCoverage_21cda90b')}
          value={formatPercent(network_effects.topic_coverage_rate)}
          sub={t('extracted.growth.kpiCards.topics5Reviews_c0950965')}
        />
        <StatCard
          label={t('extracted.growth.kpiCards.newUsersVisit_ec295d23')}
          value={formatPercent(network_effects.signup_visit_ratio)}
          sub={t('extracted.growth.kpiCards.lpvisitsLpVisits_e95f023b', {
            lpVisits: formatNumber(network_effects.landing_page_visits, uiLocale),
          })}
        />
        <StatCard
          label={t('extracted.growth.kpiCards.mrr_2e6aa59d')}
          value={formatScaledMoneyAggregateList(revenue.mrr_by_currency, uiLocale)}
        />
        <StatCard
          label={t('extracted.growth.kpiCards.activeMemberships_023b5c7e')}
          value={formatNumber(revenue.active_memberships, uiLocale)}
          sub={t('extracted.growth.kpiCards.churnrateChurn_8dd44167', {
            churnRate: formatPercent(revenue.churn_rate),
          })}
        />
      </div>
    </section>
  )
}
