// oxlint-disable react-doctor/prefer-dynamic-import -- dedicated chart file; recharts is the core dependency
'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { ContentProduction } from '@/types/growth-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  contentProduction: ContentProduction
}

const axisTick = { fontSize: 11 }
const formatAxisDate = (value: string) => value.slice(5)

export function ContentProductionChart({ contentProduction }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const data = contentProduction.content_over_time.map(d => ({
    date: d.date,
    posts: d.count,
  }))

  const { posts_by_type } = contentProduction

  return (
    <div className='rounded-xl border border-border bg-card p-4 shadow-sm'>
      <h3 className='mb-4 text-base font-semibold'>
        {t('extracted.growth.contentProductionChart.contentProduction_60e020d3')}
      </h3>
      <div className='mb-4 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-5'>
        <div className='rounded bg-blue-50 p-2 dark:bg-blue-950'>
          <div className='font-bold text-blue-700 dark:text-blue-300'>
            {formatNumber(posts_by_type.review, uiLocale)}
          </div>
          <div className='text-muted-foreground'>
            {t('extracted.growth.contentProductionChart.reviews_84cb7871')}
          </div>
        </div>
        <div className='rounded bg-green-50 p-2 dark:bg-green-950'>
          <div className='font-bold text-green-700 dark:text-green-300'>
            {formatNumber(posts_by_type.data_point, uiLocale)}
          </div>
          <div className='text-muted-foreground'>
            {t('extracted.growth.contentProductionChart.dataPoints_1da65e3a')}
          </div>
        </div>
        <div className='rounded bg-purple-50 p-2 dark:bg-purple-950'>
          <div className='font-bold text-purple-700 dark:text-purple-300'>
            {formatNumber(posts_by_type.discussion, uiLocale)}
          </div>
          <div className='text-muted-foreground'>
            {t('extracted.growth.contentProductionChart.discussions_60157cfc')}
          </div>
        </div>
        <div className='rounded bg-orange-50 p-2 dark:bg-orange-950'>
          <div className='font-bold text-orange-700 dark:text-orange-300'>
            {formatNumber(posts_by_type.comment, uiLocale)}
          </div>
          <div className='text-muted-foreground'>
            {t('extracted.growth.contentProductionChart.comments_355f79f2')}
          </div>
        </div>
        <div className='rounded bg-pink-50 p-2 dark:bg-pink-950'>
          <div className='font-bold text-pink-700 dark:text-pink-300'>
            {formatNumber(posts_by_type.story, uiLocale)}
          </div>
          <div className='text-muted-foreground'>
            {t('extracted.growth.contentProductionChart.stories_6d09cf57')}
          </div>
        </div>
      </div>
      <ResponsiveContainer
        width='100%'
        height={200}
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
          <Legend />
          <Area
            type='monotone'
            dataKey='posts'
            stroke='#8b5cf6'
            fill='#ede9fe'
            name='Posts'
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
