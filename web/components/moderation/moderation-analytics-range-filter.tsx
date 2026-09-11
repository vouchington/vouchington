'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ModerationAnalyticsRange } from '@/types/moderation-analytics'
import type { MessageKey } from '@ts-shared/ui-messages'

const RANGE_OPTIONS: { value: ModerationAnalyticsRange; labelKey?: MessageKey }[] = [
  { value: 'today' },
  {
    value: '7d',
    labelKey: 'extracted.moderationAnalytics.moderationAnalyticsDashboard.last7Days_0603deca',
  },
  {
    value: '30d',
    labelKey: 'extracted.moderationAnalytics.moderationAnalyticsDashboard.last30Days_f8f03fb4',
  },
  {
    value: '90d',
    labelKey: 'extracted.moderationAnalytics.moderationAnalyticsDashboard.last90Days_9902d7ae',
  },
  {
    value: 'all',
    labelKey: 'extracted.moderationAnalytics.moderationAnalyticsDashboard.allTime_9755c8d7',
  },
]

interface ModerationAnalyticsRangeFilterProps {
  basePath: string
  range: ModerationAnalyticsRange
  todayLabelKey?: MessageKey
}

export function ModerationAnalyticsRangeFilter({
  basePath,
  range,
  todayLabelKey = 'extracted.moderationAnalytics.moderationAnalyticsDashboard.today_2b065c7c',
}: ModerationAnalyticsRangeFilterProps) {
  const t = useTranslations()
  const router = useRouter()

  return (
    <div className='flex items-center gap-2'>
      <Label
        htmlFor='moderation-analytics-range'
        className='text-muted-foreground'
      >
        {t('extracted.moderationAnalytics.moderationAnalyticsDashboard.period_d4ba2180')}
      </Label>
      <Select
        value={range}
        onValueChange={value => {
          const nextRange = value as ModerationAnalyticsRange
          router.push(nextRange === '30d' ? basePath : `${basePath}?range=${nextRange}`)
        }}
      >
        <SelectTrigger
          id='moderation-analytics-range'
          className='w-36'
          data-pw='moderation-analytics-range'
        >
          <SelectValue
            placeholder={t(
              'extracted.moderationAnalytics.moderationAnalyticsDashboard.selectRange_7ee47c02',
            )}
          />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map(option => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {t(option.labelKey ?? todayLabelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
