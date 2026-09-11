'use client'

import type { MessageKey } from '@ts-shared/ui-messages'
import { BookOpen, Globe, Database, MessageSquare } from 'lucide-react'
import { formatCompactNumber } from '@ts-shared/utils'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import type { PlatformStatsViewModel } from '@/lib/view-models/homepage-view-models'

interface PlatformStatsBarProps {
  data: PlatformStatsViewModel | null
}

const VISIBILITY_THRESHOLD = 5

interface StatItemProps {
  icon: React.ReactNode
  label: MessageKey
  value: number
}

function StatItem({ icon, label, value }: StatItemProps) {
  const uiLocale = useUiLocale()
  const t = useTranslations()
  if (value < VISIBILITY_THRESHOLD) return null
  return (
    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
      {icon}
      <span className='font-semibold text-foreground'>{formatCompactNumber(value, uiLocale)}</span>
      <span>{t(label)}</span>
    </div>
  )
}

export function PlatformStatsBar({ data }: PlatformStatsBarProps) {
  if (!data) return null

  const stats: StatItemProps[] = [
    {
      icon: <Database className='h-4 w-4' />,
      label: 'extracted.home.platformStatsBar.dataPoints_1da65e3a',
      value: data.data_point_count,
    },
    {
      icon: <BookOpen className='h-4 w-4' />,
      label: 'extracted.home.platformStatsBar.topics_e22820fc',
      value: data.topic_count,
    },
    {
      icon: <MessageSquare className='h-4 w-4' />,
      label: 'extracted.home.platformStatsBar.reviews_84cb7871',
      value: data.review_count,
    },
    {
      icon: <Globe className='h-4 w-4' />,
      label: 'extracted.home.platformStatsBar.trustedDomains_4000aeb2',
      value: data.hostname_count,
    },
  ]

  const visibleStats = stats.filter(s => s.value >= VISIBILITY_THRESHOLD)
  if (visibleStats.length === 0) return null

  return (
    <div className='flex flex-wrap gap-x-6 gap-y-2 rounded-lg border bg-muted/50 p-4'>
      {visibleStats.map(stat => (
        <StatItem
          key={stat.label}
          icon={stat.icon}
          label={stat.label}
          value={stat.value}
        />
      ))}
    </div>
  )
}
