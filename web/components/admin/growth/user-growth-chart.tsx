// oxlint-disable react-doctor/prefer-dynamic-import -- dedicated chart file; recharts is the core dependency
'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { UserGrowth } from '@/types/growth-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  userGrowth: UserGrowth
}

const axisTick = { fontSize: 11 }
const formatAxisDate = (value: string) => value.slice(5)

export function UserGrowthChart({ userGrowth }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const data = userGrowth.signups_over_time.map(d => ({
    date: d.date,
    signups: d.count,
  }))

  return (
    <div className='rounded-xl border border-border bg-card p-4 shadow-sm'>
      <h3 className='mb-4 text-base font-semibold'>
        {t('extracted.growth.userGrowthChart.signupsOverTime_ff8ffad8')}
      </h3>
      <ResponsiveContainer
        width='100%'
        height={240}
      >
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray='3 3' />
          <XAxis
            dataKey='date'
            tick={axisTick}
            tickFormatter={formatAxisDate}
          />
          <YAxis
            tick={axisTick}
            tickFormatter={value => formatNumber(Number(value), uiLocale)}
          />
          <Tooltip formatter={value => formatNumber(Number(value), uiLocale)} />
          <Area
            type='monotone'
            dataKey='signups'
            stroke='#3b82f6'
            fill='#bfdbfe'
            name='New Users'
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
