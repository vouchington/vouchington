'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { UnmappedCategoryStatus } from '@/types/rss-feed-categories'
import { useTranslations } from '@/lib/i18n/use-translations'

export function RssFeedCategoryStatusFilter() {
  return (
    <Suspense fallback={null}>
      <RssFeedCategoryStatusFilterContent />
    </Suspense>
  )
}

function RssFeedCategoryStatusFilterContent() {
  const t = useTranslations()
  const { push } = useRouter()
  const searchParams = useSearchParams()
  const status = (searchParams.get('status') as UnmappedCategoryStatus) ?? 'pending'

  const statusOptions: { value: UnmappedCategoryStatus; label: string }[] = [
    { value: 'pending', label: t('extracted.rssFeedCategories.statusFilter.pending_331551b0') },
    { value: 'rejected', label: t('extracted.rssFeedCategories.statusFilter.rejected_aea4a04a') },
    { value: 'all', label: t('extracted.rssFeedCategories.statusFilter.all_a52ace42') },
  ]

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'pending') params.delete('status')
    else params.set('status', value)
    params.delete('after')
    push(`/rss-feed-categories?${params.toString()}`)
  }

  return (
    <Select
      value={status}
      onValueChange={handleChange}
    >
      <SelectTrigger
        aria-label={t('extracted.rssFeedCategories.statusFilter.categoryStatusFilter_a6fff94d')}
        data-pw='rss-category-status-filter'
        className='w-40'
      >
        <SelectValue placeholder={t('extracted.rssFeedCategories.statusFilter.pending_331551b0')} />
      </SelectTrigger>
      <SelectContent>
        {statusOptions.map(opt => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            // oxlint-disable-next-line no-mistakes/playwright-literals -- static template over finite status enum
            data-pw={`rss-category-status-${opt.value}`}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
