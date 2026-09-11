// oxlint-disable react-doctor/prefer-dynamic-import -- dedicated chart file; recharts is the core dependency
'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { Revenue } from '@/types/growth-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatScaledMoneyAggregateList } from '@/lib/money'

interface Props {
  revenue: Revenue
}

export function RevenueChart({ revenue }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const tierData = Object.entries(revenue.memberships_by_tier)
    .map(([tier, count]) => ({ tier, count }))
    .toSorted((a, b) => a.tier.localeCompare(b.tier))

  const changeData = [
    {
      id: 'upgrades',
      name: t('extracted.growth.revenueChart.upgrades_e02a5941'),
      value: revenue.upgrades,
      fill: '#10b981',
    },
    {
      id: 'downgrades',
      name: t('extracted.growth.revenueChart.downgrades_6045adc0'),
      value: revenue.downgrades,
      fill: '#f59e0b',
    },
    {
      id: 'cancellations',
      name: t('extracted.growth.revenueChart.cancellations_52ea24f1'),
      value: revenue.cancellations,
      fill: '#ef4444',
    },
  ]

  const hasTiers = tierData.length > 0
  const hasChanges = revenue.upgrades + revenue.downgrades + revenue.cancellations > 0

  return (
    <div className='rounded-xl border border-border bg-card p-4 shadow-sm'>
      <h3 className='mb-4 text-base font-semibold'>
        {t('extracted.growth.revenueChart.revenueMemberships_048d7ee5')}
      </h3>
      <div className='mb-4 flex flex-wrap gap-4 text-sm'>
        <div>
          <span className='text-muted-foreground'>
            {t('extracted.growth.revenueChart.mrr_dc8fda3a')}{' '}
          </span>
          <span className='font-bold'>
            {formatScaledMoneyAggregateList(revenue.mrr_by_currency, uiLocale)}
          </span>
        </div>
        <div>
          <span className='text-muted-foreground'>
            {t('extracted.growth.revenueChart.active_b49c81b7')}{' '}
          </span>
          <span className='font-bold'>{formatNumber(revenue.active_memberships, uiLocale)}</span>
        </div>
        <div>
          <span className='text-muted-foreground'>
            {t('extracted.growth.revenueChart.churn_06760fa0')}{' '}
          </span>
          <span className='font-bold'>
            {t('extracted.growth.revenueChart.pct_76b8d2be', {
              pct: (revenue.churn_rate * 100).toFixed(1),
            })}
          </span>
        </div>
      </div>
      {hasTiers && (
        <div className='mb-4'>
          <p className='mb-2 text-xs font-medium text-muted-foreground'>
            {t('extracted.growth.revenueChart.byTier_c452a559')}
          </p>
          <ResponsiveContainer
            width='100%'
            height={160}
          >
            <BarChart data={tierData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='tier'
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={value => formatNumber(Number(value), uiLocale)}
              />
              <Tooltip formatter={value => formatNumber(Number(value), uiLocale)} />
              <Bar
                dataKey='count'
                fill='#3b82f6'
                name={t('extracted.growth.revenueChart.members_1044a4c0')}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {hasChanges && (
        <div>
          <p className='mb-2 text-xs font-medium text-muted-foreground'>
            {t('extracted.growth.revenueChart.membershipChanges_1fbbf76c')}
          </p>
          <div className='flex gap-4'>
            {changeData.map(item => (
              <div
                key={item.id}
                className='text-center'
              >
                <div
                  className='text-2xl font-bold'
                  style={{ color: item.fill }}
                >
                  {formatNumber(item.value, uiLocale)}
                </div>
                <div className='text-xs text-muted-foreground'>{item.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
