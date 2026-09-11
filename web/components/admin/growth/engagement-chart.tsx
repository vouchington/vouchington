// oxlint-disable react-doctor/prefer-dynamic-import -- dedicated chart file; recharts is the core dependency
'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { Engagement } from '@/types/growth-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  engagement: Engagement
}

const axisTick = { fontSize: 11 }
const formatAxisDate = (value: string) => value.slice(5)

export function EngagementChart({ engagement }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const dateMap = new Map<string, { votes: number; comments: number; follows: number }>()

  for (const { date, count } of engagement.votes_over_time) {
    const entry = dateMap.get(date) ?? { votes: 0, comments: 0, follows: 0 }
    entry.votes = count
    dateMap.set(date, entry)
  }
  for (const { date, count } of engagement.comments_over_time) {
    const entry = dateMap.get(date) ?? { votes: 0, comments: 0, follows: 0 }
    entry.comments = count
    dateMap.set(date, entry)
  }
  for (const { date, count } of engagement.follows_over_time) {
    const entry = dateMap.get(date) ?? { votes: 0, comments: 0, follows: 0 }
    entry.follows = count
    dateMap.set(date, entry)
  }

  const data = [...dateMap.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }))

  return (
    <div className='rounded-xl border border-border bg-card p-4 shadow-sm'>
      <h3 className='mb-4 text-base font-semibold'>
        {t('extracted.growth.engagementChart.engagementOverTime_c1c460e8')}
      </h3>
      <ResponsiveContainer
        width='100%'
        height={240}
      >
        <LineChart data={data}>
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
          <Legend />
          <Line
            type='monotone'
            dataKey='votes'
            stroke='#f59e0b'
            dot={false}
            name='Votes'
          />
          <Line
            type='monotone'
            dataKey='comments'
            stroke='#10b981'
            dot={false}
            name='Comments'
          />
          <Line
            type='monotone'
            dataKey='follows'
            stroke='#6366f1'
            dot={false}
            name='Follows'
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
