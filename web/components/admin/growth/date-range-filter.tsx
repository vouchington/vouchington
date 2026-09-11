'use client'

import { useRouter } from 'next/navigation'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GrowthRange } from '@/types/growth-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { MessageKey } from '@ts-shared/ui-messages'

const RANGE_OPTIONS: { value: GrowthRange; labelKey: MessageKey }[] = [
  { value: 'today', labelKey: 'extracted.growth.dateRangeFilter.today_2b065c7c' },
  { value: '7d', labelKey: 'extracted.growth.dateRangeFilter.last7Days_0603deca' },
  { value: '30d', labelKey: 'extracted.growth.dateRangeFilter.last30Days_f8f03fb4' },
  { value: '90d', labelKey: 'extracted.growth.dateRangeFilter.last90Days_9902d7ae' },
  { value: 'all', labelKey: 'extracted.growth.dateRangeFilter.allTime_9755c8d7' },
]

interface Props {
  range: GrowthRange
}

function handleRangeChange(router: ReturnType<typeof useRouter>, value: GrowthRange) {
  if (value === '30d') {
    router.push('/growth')
  } else {
    router.push(`/growth?range=${value}`)
  }
}

export function DateRangeFilter({ range }: Props) {
  const t = useTranslations()
  const router = useRouter()

  return (
    <div className='flex items-center gap-2'>
      <Label
        htmlFor='range-select'
        className='text-muted-foreground'
      >
        {t('extracted.growth.dateRangeFilter.period_d4ba2180')}
      </Label>
      <Select
        value={range}
        onValueChange={value => handleRangeChange(router, value as GrowthRange)}
      >
        <SelectTrigger
          id='range-select'
          className='w-36'
        >
          <SelectValue placeholder={t('extracted.growth.dateRangeFilter.selectRange_7ee47c02')} />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map(opt => (
            <SelectItem
              key={opt.value}
              value={opt.value}
            >
              {t(opt.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
