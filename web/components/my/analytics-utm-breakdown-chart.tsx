// oxlint-disable react-doctor/prefer-dynamic-import -- dedicated chart file; recharts is the core dependency
'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { UtmSourceStats } from '@/types/landing-pages'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  utmSources: UtmSourceStats[]
}

export function AnalyticsUtmBreakdownChart({ utmSources }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <section>
      <h2 className='mb-4 text-lg font-semibold'>
        {t('extracted.my.analyticsUtmBreakdownChart.trafficSources_a02077a9')}
      </h2>
      <div className='rounded-xl border border-border bg-card p-4 shadow-sm'>
        <ResponsiveContainer
          width='100%'
          height={Math.max(200, utmSources.length * 40)}
        >
          <BarChart
            data={utmSources}
            layout='vertical'
          >
            <CartesianGrid
              strokeDasharray='3 3'
              className='stroke-border'
            />
            <XAxis
              type='number'
              allowDecimals={false}
              className='text-xs'
              tickFormatter={value => formatNumber(Number(value), uiLocale)}
            />
            <YAxis
              type='category'
              dataKey='utm_source'
              width={120}
              className='text-xs'
            />
            <Tooltip formatter={value => formatNumber(Number(value), uiLocale)} />
            <Bar
              dataKey='visits'
              name='Visits'
              fill='#8b5cf6'
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
