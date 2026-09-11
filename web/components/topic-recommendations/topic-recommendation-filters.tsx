'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ListFilters } from '@/components/shared/list-filters'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'

function TopicRecommendationFiltersContent() {
  const t = useTranslations()
  const STATUS_OPTIONS = [
    {
      value: 'all',
      label: t('extracted.topicRecommendations.topicRecommendationFilters.all_a52ace42'),
    },
    {
      value: 'pending',
      label: t('extracted.topicRecommendations.topicRecommendationFilters.pending_331551b0'),
    },
    {
      value: 'approved',
      label: t('extracted.topicRecommendations.topicRecommendationFilters.approved_87b42e40'),
    },
    {
      value: 'rejected',
      label: t('extracted.topicRecommendations.topicRecommendationFilters.rejected_aea4a04a'),
    },
  ]
  const { push } = useRouter()
  const searchParams = useSearchParams()
  const rawStatus = searchParams.get('status') ?? 'all'
  const currentStatus = STATUS_OPTIONS.some(o => o.value === rawStatus) ? rawStatus : 'all'

  function handleStatusChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('status')
    } else {
      params.set('status', value)
    }
    params.delete('after')
    push(`?${params.toString()}`, { scroll: false })
  }

  return (
    <ListFilters
      defaultSort=''
      sortOptions={[]}
      showSort={false}
      placeholder={t(
        'extracted.topicRecommendations.topicRecommendationFilters.searchRecommendations_1bb02573',
      )}
    >
      <Select
        value={currentStatus}
        onValueChange={handleStatusChange}
      >
        <SelectTrigger
          aria-label={t(
            'extracted.topicRecommendations.topicRecommendationFilters.status_920e413c',
          )}
          className='h-11 w-40 sm:h-9'
          data-pw='topic-recommendation-status-filter'
        >
          <SelectValue
            placeholder={t(
              'extracted.topicRecommendations.topicRecommendationFilters.status_920e413c',
            )}
          />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map(option => (
            <SelectItem
              key={option.value}
              value={option.value}
              // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from options
              data-pw={`topic-recommendation-status-option-${option.value}`}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ListFilters>
  )
}

export function TopicRecommendationFilters() {
  return (
    <Suspense fallback={null}>
      <TopicRecommendationFiltersContent />
    </Suspense>
  )
}
