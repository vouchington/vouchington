// oxlint-disable react-doctor/prefer-dynamic-import -- dedicated chart file; recharts is the core dependency
'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { ContentProduction } from '@/types/growth-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  contentProduction: ContentProduction
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899']

export function ContentHealth({ contentProduction }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const { posts_by_type, clearance_approval_rate, contributions_per_active_user } =
    contentProduction

  const pieData = [
    { name: t('extracted.growth.contentHealth.reviews_3a7c9e12'), value: posts_by_type.review },
    {
      name: t('extracted.growth.contentHealth.dataPoints_5d1b8f43'),
      value: posts_by_type.data_point,
    },
    {
      name: t('extracted.growth.contentHealth.discussions_9e2f0a76'),
      value: posts_by_type.discussion,
    },
    { name: t('extracted.growth.contentHealth.comments_1c4d6b85'), value: posts_by_type.comment },
    { name: t('extracted.growth.contentHealth.stories_7f8a2e39'), value: posts_by_type.story },
  ].filter(d => d.value > 0)

  return (
    <div className='rounded-xl border border-border bg-card p-4 shadow-sm'>
      <h3 className='mb-4 text-base font-semibold'>
        {t('extracted.growth.contentHealth.contentHealth_845ce9e6')}
      </h3>
      <div className='mb-4 flex gap-6 text-sm'>
        <div>
          <p className='text-muted-foreground'>
            {t('extracted.growth.contentHealth.clearanceRate_692c9ba8')}
          </p>
          <p className='text-2xl font-bold'>{(clearance_approval_rate * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className='text-muted-foreground'>
            {t('extracted.growth.contentHealth.contributionsUser_a602409d')}
          </p>
          <p className='text-2xl font-bold'>{contributions_per_active_user.toFixed(1)}</p>
        </div>
      </div>
      {pieData.length > 0 && (
        <ResponsiveContainer
          width='100%'
          height={200}
        >
          <PieChart>
            <Pie
              data={pieData}
              cx='50%'
              cy='50%'
              outerRadius={70}
              dataKey='value'
              labelLine={false}
            >
              {pieData.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip formatter={value => formatNumber(Number(value), uiLocale)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
